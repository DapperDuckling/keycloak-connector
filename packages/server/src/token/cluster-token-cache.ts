import {AbstractTokenCache} from "./abstract-token-cache.js";
import type {TokenCacheConfig} from "./abstract-token-cache.js";
import {
    AbstractClusterProvider
} from "../cluster/abstract-cluster-provider.js";
import type {RefreshTokenSet, RefreshTokenSetResult} from "../types.js";
import * as jose from "jose";
import {deferredFactory, promiseWait, sleep, WaitTimeoutError} from "../helpers/utils.js";
import {is} from "typia";
import {setImmediate} from "timers";

type RefreshTokenSetMessage = {
    refreshTokenSet: RefreshTokenSet,
    updateId: string,
}

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

        //todo: determine the listener count at this point
        debugger;

        // Determine if we are not the first listener
        if (this.tokenUpdateEmitter.listenerCount(updateId) !== 0) {
            await this.waitForResult(updateId);
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

    protected waitForResult = (updateId: string): Promise<RefreshTokenSetResult | undefined> => {

        // Record last retry time
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

    protected handleIncomingUpdateToken = (message: unknown) => {

        // Check for a non refresh token set message
        if (!is<RefreshTokenSetMessage>(message)) {
            return;
        }

        // Update the local cache with the new token message
        this.cachedRefresh.set(message.updateId, message.refreshTokenSet);

        // Call any pending promises
        const pendingRefresh = this.pendingRefresh.get(message.updateId);
        if (pendingRefresh) {
            setImmediate(() => {
                pendingRefresh.resolve(message.refreshTokenSet)
            });
        }
    }
    
    protected handleTokenRefresh = async (updateId: string, validatedRefreshJwt: string): Promise<RefreshTokenSetResult | undefined> => {

        // Start listening to cluster messages for this update id
        const listeningChannel = `${this.constants.UPDATE_TOKEN}:${updateId}`;
        await this.clusterProvider.subscribe(listeningChannel, this.handleIncomingUpdateToken);

        // Track the lock flag
        let lock = false;

        // Build the lock options
        const lockOptions = {
            key: `${this.constants._PREFIX}:${this.constants.UPDATE_TOKEN}`,
            ttl: 60,
        }

        try {
            // Grab an already completed update request stored with the cluster provider
            const existingResult = await this.clusterProvider.getObject<RefreshTokenSet>(updateId);
            if (existingResult) return {
                refreshTokenSet: existingResult,
                shouldUpdateCookies: false,
            };

            // Record the final retry time
            const finalRetryTimeMs = Date.now() + AbstractTokenCache.MAX_WAIT_SECS * 1000;

            do {
                // Store the pending refresh
                const deferredRefresh = deferredFactory<RefreshTokenSet | undefined>();
                this.pendingRefresh.set(updateId, deferredRefresh);

                // Get reference to token refresh promise
                const tokenRefreshPromise = this.performTokenRefresh(validatedRefreshJwt);

                // Grab a lock
                lock = await this.clusterProvider.lock(lockOptions);

                // Check for no lock
                if (!lock) {
                    try {
                        // Wait for a pending refresh
                        const refreshTokenSet = await promiseWait<RefreshTokenSet | undefined>(deferredRefresh.promise, finalRetryTimeMs);
                        if (refreshTokenSet) return {
                            refreshTokenSet: refreshTokenSet,
                            shouldUpdateCookies: false,
                        };
                    } catch (e) {
                        // Likely timed out, ignore
                    }

                    // Timed out or received no token from cluster
                    continue;
                }

                // Refresh the token
                const tokenSet = await tokenRefreshPromise;

                // Check for a new token set, do update the cookies here
                if (tokenSet) return {
                    refreshTokenSet: tokenSet,
                    shouldUpdateCookies: true,
                }
            } while (
                Date.now() <= finalRetryTimeMs &&       // Check exit condition
                await sleep(25, 150)   // Add some random sleep for next loop
            );
        } catch (e) {
            // Log error
            this.config.pinoLogger?.warn(`Failed perform token refresh`, e);
            
        } finally {
            
            // Unsubscribe from the listener
            await this.clusterProvider.unsubscribe(listeningChannel, this.handleIncomingUpdateToken);
            
            // Release the lock
            if (lock) await this.clusterProvider.unlock(lockOptions);
            
        }

        return undefined;
    }
}