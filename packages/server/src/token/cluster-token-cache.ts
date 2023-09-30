import {AbstractTokenCache} from "./abstract-token-cache.js";
import type {TokenCacheConfig} from "./abstract-token-cache.js";
import {AbstractClusterProvider, BaseClusterEvents, LockOptions} from "../cluster/abstract-cluster-provider.js";
import type {RefreshTokenSet, RefreshTokenSetResult} from "../types.js";
import * as jose from "jose";
import {promiseWait, sleep, WaitTimeoutError} from "../helpers/utils.js";

export class ClusterTokenCache extends AbstractTokenCache {
    private readonly constants = {
        _PREFIX: "token-cache",
        UPDATE_TOKEN: "update-token",
        LISTENING_CHANNEL: "listening-channel",
    } as const;
    private readonly clusterProvider: AbstractClusterProvider;

    private constructor(config: TokenCacheConfig) {
        super(config);

        // Check for a cluster provider
        if (config.clusterProvider === undefined) {
            throw new Error(`Cannot initialize ${this.constructor.name} without a cluster provider.`);
        }

        // Store reference to the cluster provider
        this.clusterProvider = config.clusterProvider;

        // Listen for reconnections
        this.clusterProvider.addListener(BaseClusterEvents.SUBSCRIBER_RECONNECTED, () => this.onActiveKeyUpdate);

        //todo: always listen for refresh token results, we can ignore them if we need to
    }

    //todo: centralize similar code with standalone-token-cache.ts
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

        // Grab an already completed update request in local cache
        const cachedRefresh = this.cachedRefresh.get(updateId);
        if (cachedRefresh) return {
            refreshTokenSet: cachedRefresh,
            shouldUpdateCookies: false,
        }

        // Record start time
        const attemptStartTime = Date.now();
        const lastRetryTimeMs = attemptStartTime + AbstractTokenCache.MAX_WAIT_SECS * 1000;

        //todo: determine the listener count at this point
        debugger;

        // Determine if we are not the first listener
        if (this.tokenUpdateEmitter.listenerCount(updateId) !== 0) {
            await this.waitForResult(updateId, lastRetryTimeMs);
        }

        // We are the first listener, so update the refresh token for this instance
        const refreshTokenSetResult = await this.handleTokenRefresh(updateId, validatedRefreshJwt);

        // Check for no result
        if (refreshTokenSetResult === undefined) {
            this.tokenUpdateEmitter.emit(updateId, undefined);
            return undefined;
        }

        // Store the result in local cache
        this.cachedRefresh.set(updateId, refreshTokenSetResult.refreshTokenSet);

        // Emit the new token set
        this.tokenUpdateEmitter.emit(updateId, refreshTokenSetResult.refreshTokenSet);

        // Return the full result
        return refreshTokenSetResult;
    }

    protected waitForResult = (updateId: string, lastRetryTimeMs: number): Promise<RefreshTokenSetResult | undefined> => {
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

                // Resolve with result set
                resolve({
                    refreshTokenSet: refreshTokenSet,
                    shouldUpdateCookies: false,
                });
            };

            // Set event listener
            this.tokenUpdateEmitter.once(updateId, refreshListener);
        });

        // Wait for the result (or timeout)
        return promiseWait(updatePromise, lastRetryTimeMs).catch(e => {
            // Stop listening
            if (refreshListener) this.tokenUpdateEmitter.removeListener(updateId, refreshListener);

            if (e instanceof WaitTimeoutError) {
                // Log this in order to inform the owner they may need to increase the wait timeout
                this.config.pinoLogger?.warn(`Timed out waiting for refresh token update promise to complete. May consider increasing the wait time or investigating why the request is taking so long.`);
            }

            return undefined;
        });
    };

    protected handleTokenRefresh = async (updateId: string, validatedRefreshJwt: string): Promise<RefreshTokenSetResult | undefined> => {

        // Grab an already completed update request stored with the cluster provider
        const existingResult = await this.clusterProvider.getObject<RefreshTokenSet>(updateId);
        if (existingResult) return {
            refreshTokenSet: existingResult,
            shouldUpdateCookies: false,
        };

        const lockOptions = {
            key: `${this.constants._PREFIX}:${this.constants.UPDATE_TOKEN}`,
            ttl: 60,
        }

        // Attempt to regenerate the
        do {
            let lock = false;

            try {
                // Get reference to token refresh promise
                const tokenRefreshPromise = this.performTokenRefresh(validatedRefreshJwt);

                // Grab a lock
                lock = await this.clusterProvider.lock(lockOptions);

                // Check for no lock
                if (!lock) {
                    // Wait on broadcast message (or timeout)

                    // Timed out or no refresh token set from broadcast, loop
                    continue
                }

                // Just in case there was an update between the last time we checked and after we obtained the lock
                const existingResult = await this.clusterProvider.getObject<RefreshTokenSet>(updateId);
                if (existingResult) return {
                    refreshTokenSet: existingResult,
                    shouldUpdateCookies: false,
                };

                // Refresh the token
                const tokenSet = await tokenRefreshPromise;

                // Check for a new token set, do update the cookies here
                if (tokenSet) return {
                    refreshTokenSet: tokenSet,
                    shouldUpdateCookies: true,
                }
            } catch (e) {
                // Log error
                this.config.pinoLogger?.warn(`Failed perform token refresh`, e);
            } finally {
                // Release the lock
                if (lock) await this.clusterProvider.unlock(lockOptions);
            }
        } while (
            Date.now() <= lastRetryTimeMs &&         // Check exit condition
            await sleep(25, 150)   // Add some random sleep for next loop
        );

        return Promise.resolve(undefined);
    }
}