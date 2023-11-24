import {AbstractClusterProvider} from "../cluster/index.js";
import type {Logger} from "pino";
import {EventEmitter} from "node:events";
import {LRUCache} from "lru-cache";
import {promiseWait, promiseWaitTimeout, ttlFromExpiration, WaitTimeoutError} from "../helpers/utils.js";
import {webcrypto} from "crypto";
import * as jose from 'jose';
import type {JWTPayload} from "jose/dist/types/types.js";

export type CacheMissCallback<T, A extends any[] = any[]> = (...args: A) => Promise<T | undefined>;

export type CacheProviderConfig<T, A extends any[] = any[]> = {
    title: string,
    ttl: number,
    cacheMissCallback: CacheMissCallback<T, A>,
    cacheMissMaxWaitSecs?: number,
    maxWaitSecs?: number,
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
}

export type CacheResult<T> = undefined | {
    data: T,
    dataGenerator?: true,
}

export type WrappedCacheMissCallback<T> = () => Promise<T | undefined>;

export class CacheProvider<T extends NonNullable<unknown>, A extends any[] = any[]> {

    protected static MAX_UPDATE_JWT_ID_LENGTH = 1000;
    protected static MAX_WAIT_SECS = 10;
    protected static CACHE_MISS_MAX_WAIT_SECS = 120;

    protected readonly config: CacheProviderConfig<T, A>;
    protected readonly updateEmitter = new EventEmitter();
    protected readonly instanceLevelUpdateLock: LRUCache<string, string>;
    protected readonly cachedResult: LRUCache<string, T>;

    constructor(config: CacheProviderConfig<T, A>) {
        // Update pino logger reference
        if (config.pinoLogger) {
            config.pinoLogger = config.pinoLogger.child({"Source": "CacheProvider"}).child({"Source": config.title});
        }

        // Add generic error handler to the token update emitter
        this.updateEmitter.on('error', (e) => {
            // Log the error
            this.config.pinoLogger?.error(e);
            this.config.pinoLogger?.error(`Error in cache`);
        });

        // Build the LRU caches
        this.instanceLevelUpdateLock = new LRUCache<string, string>({
            max: 10000,
            ttl: config.ttl * 1000,
        });

        this.cachedResult = new LRUCache<string, T>({
            max: 10000,
            ttl: config.ttl * 1000,
        });

        // Store the config
        this.config = config;
    }

    async invalidateFromJwt(validatedJwt: string, targetKeyParam: keyof JWTPayload) {
        // Grab the key and expiration from the jwt
        const jwtData = this.jwtToKey(validatedJwt, targetKeyParam);

        // Check for no result
        if (jwtData === undefined) return;

        await this.invalidateCache(jwtData.key);
    }

    async invalidateCache(key: string) {
        // Nuke local cache
        this.cachedResult.delete(key);
    }

    private jwtToKey = (validatedJwt: string, targetKeyParam: keyof JWTPayload) => {
        // Decode JWT
        const token = jose.decodeJwt(validatedJwt);

        // Grab the key from the token
        const key = token[targetKeyParam];

        // Check for a key
        if (key === undefined) {
            this.config.pinoLogger?.error(`"${targetKeyParam}" key found on a validated token object`);
            return undefined;
        }

        // Ensure key is a string
        if (typeof key !== "string") {
            this.config.pinoLogger?.error(`"${targetKeyParam} key found on validated token object is not a string`);
            return undefined;
        }

        // Check for reasonable update id length
        if (key.length > CacheProvider.MAX_UPDATE_JWT_ID_LENGTH) {
            this.config.pinoLogger?.error(`JWT ID length exceeded ${CacheProvider.MAX_UPDATE_JWT_ID_LENGTH}, received ${key.length} characters`);
            return undefined;
        }

        // Check for an expiration timestamp
        const expiration = token.exp;
        if (expiration === undefined) {
            this.config.pinoLogger?.error(`JWT had no 'exp' claim, cannot use for cache`);
            return undefined;
        }

        return { key, expiration };
    }

    readonly getFromJwt = async (validatedJwt: string, targetKeyParam: keyof JWTPayload, callbackArgs: A) => {

        this.config.pinoLogger?.debug(`Validating jwt`);

        // Grab the key and expiration from the jwt
        const jwtData = this.jwtToKey(validatedJwt, targetKeyParam);

        // Check for no result
        if (jwtData === undefined) {
            this.config.pinoLogger?.debug(`No valid jwt found on request`);
            return;
        }

        this.config.pinoLogger?.debug(`Using validated jwt to grab data from cache`);

        return this.get(jwtData.key, callbackArgs, jwtData.expiration);
    }

    readonly get = async (key: string, callbackArgs: A, expiration?: number): Promise<CacheResult<T>> => {

        // Check for result in local cache
        const cachedResult = this.cachedResult.get(key);
        if (cachedResult) {
            this.config.pinoLogger?.debug(`Cached result found locally`);
            return {
                data: cachedResult,
            }
        }

        this.config.pinoLogger?.debug(`Cache miss`);

        // Check if there is already an update occurring on this instance
        if (this.instanceLevelUpdateLock.get(key) !== undefined) {
            this.config.pinoLogger?.debug(`Waiting for result from a different provider`);
            return await this.waitForResult(key);
        }

        this.config.pinoLogger?.debug(`No other update occurring this instance, attempting to update cache`);

        // Grab instance level lock for updating the refresh token
        const instanceLockId = webcrypto.randomUUID();
        this.instanceLevelUpdateLock.set(key, instanceLockId);

        // Build the cache miss callback
        const wrappedCacheMissCallback = this.wrapCacheMissCallback(callbackArgs);

        this.config.pinoLogger?.debug(`Calling cache miss callback`);

        const result = await this.handleCacheMiss(key, wrappedCacheMissCallback, expiration);

        this.config.pinoLogger?.debug(`Cache miss callback complete`);

        // Ensure we still have the instance lock
        const currentInstanceLock = this.instanceLevelUpdateLock.get(key);
        const stillHadLock = (currentInstanceLock === instanceLockId);

        // Check if we still have a lock
        if (stillHadLock) {
            // Clear the instance level lock
            this.instanceLevelUpdateLock.delete(key);

            // Emit the result
            this.config.pinoLogger?.debug(`Emitting result locally`);
            this.updateEmitter.emit(key, result?.data);

            // Store valid result in local cache
            if (result) {
                // Calculate ttl
                const expirationTtl = ttlFromExpiration(expiration);
                const ttl = (expirationTtl) ? expirationTtl * 1000 : this.cachedResult.ttl;

                this.config.pinoLogger?.debug(`Cache update result acquired, storing locally`);
                this.cachedResult.set(key, result.data, {
                    ttl: ttl
                });
            }
        } else {
            this.config.pinoLogger?.debug(`Lost instance lock, will not emit or store a valid result`);
        }

        return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async handleCacheMiss(key: string, wrappedCacheMissCallback: WrappedCacheMissCallback<T>, expiration?: number): Promise<CacheResult<T>> {
        // Execute the wrapped cache miss callback
        const data = await wrappedCacheMissCallback();

        return (data) ? {
            data: data,
            dataGenerator: true,
        } : undefined;
    }

    private wrapCacheMissCallback(callbackArgs: A): WrappedCacheMissCallback<T> {
        return async () => {
            // Calculate the max cache miss wait time
            const maxCacheMissWaitSecs = this.config.cacheMissMaxWaitSecs ?? CacheProvider.CACHE_MISS_MAX_WAIT_SECS;

            try {
                // Grab the cache miss callback promise
                const cacheMissPromise = this.config.cacheMissCallback(...callbackArgs);

                // Wait for the cache miss callback to execute
                return await promiseWaitTimeout(cacheMissPromise, maxCacheMissWaitSecs * 1000);
            } catch (e) {
                if (e instanceof WaitTimeoutError) {
                    // Log this in order to inform the owner they may need to increase the wait timeout
                    this.config.pinoLogger?.warn(`Timed out while waiting for cache miss callback to execute. Waited ${maxCacheMissWaitSecs} seconds`);
                } else {
                    this.config.pinoLogger?.error(e);
                    this.config.pinoLogger?.error(`Unexpected unhandled error from cache miss callback`);
                }
            }

            return undefined;
        }
    }

    private waitForResult = (updateId: string): Promise<CacheResult<T>> => {

        // Record final retry time
        const finalRetryTimeMs = Date.now() + (this.config.maxWaitSecs ?? CacheProvider.MAX_WAIT_SECS) * 1000;

        // Make typescript happy
        type RefreshListener = (data: T | undefined) => void;

        // Store the update listener in a higher scope, so we can disable it later if need be
        let updateListener: RefreshListener | undefined = undefined;

        // Build the update promise wrapper
        const updatePromise = new Promise<CacheResult<T>>(resolve => {
            // Build a generic update listener
            updateListener = (data: T | undefined) => {
                // Build the response
                const response = (data !== undefined) ? {data: data} : undefined;

                // Resolve with the response
                resolve(response);
            };

            // Set event listener
            this.updateEmitter.once(updateId, updateListener);
        });

        // Wait for the result (or timeout)
        return promiseWait(updatePromise, finalRetryTimeMs).catch(e => {
            // Stop listening
            if (updateListener) this.updateEmitter.removeListener(updateId, updateListener);

            if (e instanceof WaitTimeoutError) {
                // Log this in order to inform the owner they may need to increase the wait timeout
                this.config.pinoLogger?.warn(`Timed out waiting for cache update promise to complete. May consider increasing the wait time or investigating why the request is taking so long.`);
            }

            return undefined;
        });
    }
}
