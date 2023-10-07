import type {RefreshTokenSetResult, RefreshTokenSet} from "../types.js";
import type {Logger} from "pino";
import {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import type {BaseClient} from "openid-client";
import {errors} from "openid-client";
import OPError = errors.OPError;
import * as jose from 'jose';
import {LRUCache} from "lru-cache";
import {EventEmitter} from "node:events";
import {promiseWait, WaitTimeoutError} from "../helpers/utils.js";
import {webcrypto} from "crypto";

export interface TokenCacheConfig {
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
    oidcClient: BaseClient,
}

export type HandleRefreshToken = {
    updateId: string;
    validatedRefreshJwt: string;
    isFirstThisNode: boolean;
}

export type TokenCacheProvider = (...args: ConstructorParameters<typeof AbstractTokenCache>) => Promise<AbstractTokenCache>;
export abstract class AbstractTokenCache {

    protected static MAX_UPDATE_JWT_ID_LENGTH = 1000;
    protected static MAX_WAIT_SECS = 15;
    protected static REFRESH_HOLDOVER_WINDOW_SECS = 60;
    protected config: TokenCacheConfig;
    protected readonly tokenUpdateEmitter = new EventEmitter();

    protected instanceLevelUpdateLock = new LRUCache<string, string>({
        max: 10000,
        ttl: AbstractTokenCache.MAX_WAIT_SECS * 1000,
    });
    protected cachedRefresh = new LRUCache<string, RefreshTokenSet>({
        max: 10000,
        ttl: AbstractTokenCache.REFRESH_HOLDOVER_WINDOW_SECS * 1000,
    });

    constructor(config: TokenCacheConfig) {
        this.config = config;

        // Add generic error handler to the token update emitter
        this.tokenUpdateEmitter.on('error', (e) => {
            // Log the error
            this.config.pinoLogger?.error(e, 'Error in token cache');
        })
    }

    refreshTokenSet = async (validatedRefreshJwt: string): Promise<RefreshTokenSetResult | undefined> => {

        // Decode JWTs
        const refreshToken = jose.decodeJwt(validatedRefreshJwt);

        // Make the update id the JWT ID
        const updateId = refreshToken.jti;

        // Check for a valid id
        if (updateId === undefined) {
            this.config.pinoLogger?.error('No JWT ID found on a validated refresh token.');
            return undefined;
        }

        // Check for reasonable update id length
        if (updateId.length > AbstractTokenCache.MAX_UPDATE_JWT_ID_LENGTH) {
            this.config.pinoLogger?.error(`JWT ID length exceeded ${AbstractTokenCache.MAX_UPDATE_JWT_ID_LENGTH}, received ${updateId.length} characters`);
            return undefined;
        }

        this.config.pinoLogger?.debug(`Checking for result matching provided refresh token`);

        // Grab an already completed update request in local cache
        const cachedRefresh = this.cachedRefresh.get(updateId);
        if (cachedRefresh) return {
            refreshTokenSet: cachedRefresh,
            shouldUpdateCookies: false,
        }

        this.config.pinoLogger?.debug(`No update in local cache`);

        // Check if there is already an update occurring on this instance
        if (this.instanceLevelUpdateLock.get(updateId) !== undefined) {
            this.config.pinoLogger?.debug(`Waiting for result from a different provider`);
            return await this.waitForResult(updateId);
        }

        this.config.pinoLogger?.debug(`Waiting for result from a different provider`);

        // Grab instance level lock for updating the refresh token
        const instanceLockId = webcrypto.randomUUID();
        this.instanceLevelUpdateLock.set(updateId, instanceLockId);

        // Update the refresh token for this instance
        const refreshTokenSetResult = await this.handleTokenRefresh(updateId, validatedRefreshJwt);

        // Determine if we still have the lock (or no one has the instance lock)
        const currentInstanceLock = this.instanceLevelUpdateLock.get(updateId);
        const stillHadLock = (currentInstanceLock === instanceLockId || currentInstanceLock === undefined);

        // Clear the instance level lock
        if (stillHadLock) this.instanceLevelUpdateLock.delete(updateId);

        // Check for no result
        if (refreshTokenSetResult === undefined) {
            this.config.pinoLogger?.debug(`No token refresh acquired, emit undefined response`);
            this.tokenUpdateEmitter.emit(updateId, undefined);
            return undefined;
        }

        this.config.pinoLogger?.debug(`Token refresh acquired, storing and emitting`);

        // Ensure we still had the instance lock
        if (stillHadLock) {
            // Store the result in local cache
            this.cachedRefresh.set(updateId, refreshTokenSetResult.refreshTokenSet);

            // Emit the new token set
            this.tokenUpdateEmitter.emit(updateId, refreshTokenSetResult.refreshTokenSet);
        }

        // Return the full result
        return refreshTokenSetResult;
    }

    protected waitForResult = (updateId: string): Promise<RefreshTokenSetResult | undefined> => {

        // Record final retry time
        const finalRetryTimeMs = Date.now() + AbstractTokenCache.MAX_WAIT_SECS * 1000;

        // Make typescript happy
        type RefreshListener = (refreshTokenSetResult: RefreshTokenSet | undefined) => void;

        // Store the refresh listener in a higher scope, so we can disable it later if need be
        let refreshListener: RefreshListener | undefined = undefined;

        // Build the update promise wrapper
        const updatePromise = new Promise<RefreshTokenSetResult | undefined>(resolve => {
            // Build a generic refresh token listener
            refreshListener = (refreshTokenSet: RefreshTokenSet | undefined) => {
                // Check for no result, resolve with undefined
                if (refreshTokenSet === undefined) {
                    resolve(undefined);
                    return;
                }

                // Resolve with result set, never update cookies here
                resolve({
                    refreshTokenSet: refreshTokenSet,
                    shouldUpdateCookies: false,
                });
            };

            // Set event listener
            this.tokenUpdateEmitter.once(updateId, refreshListener);
        });

        // Wait for the result (or timeout)
        return promiseWait(updatePromise, finalRetryTimeMs).catch(e => {
            // Stop listening
            if (refreshListener) this.tokenUpdateEmitter.removeListener(updateId, refreshListener);

            if (e instanceof WaitTimeoutError) {
                // Log this in order to inform the owner they may need to increase the wait timeout
                this.config.pinoLogger?.warn(`Timed out waiting for refresh token update promise to complete. May consider increasing the wait time or investigating why the request is taking so long.`);
            }

            return undefined;
        });
    };

    protected abstract handleTokenRefresh(updateId: string, validatedRefreshJwt: string): Promise<RefreshTokenSetResult | undefined>;

    protected performTokenRefresh = async (refreshJwt: string): Promise<RefreshTokenSet | undefined> => {
        // Perform the refresh
        const tokenSet = await this.config.oidcClient.refresh(refreshJwt);

        // Check for an access token
        if (tokenSet.access_token === undefined)
            throw new OPError({error: `Missing access token in refresh response`});

        // Check for a refresh token
        if (tokenSet.refresh_token === undefined)
            throw new OPError({error: `Missing refresh token in refresh response`});

        return {
            ...tokenSet,
            access_token: tokenSet.access_token,
            refresh_token: tokenSet.refresh_token,
            accessToken: jose.decodeJwt(tokenSet.access_token),
        }

    };

    static provider: TokenCacheProvider;
}