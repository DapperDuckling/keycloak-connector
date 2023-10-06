import {AbstractTokenCache} from "./abstract-token-cache.js";
import type {TokenCacheConfig} from "./abstract-token-cache.js";
import {
    AbstractClusterProvider
} from "../cluster/abstract-cluster-provider.js";
import type {RefreshTokenSet, RefreshTokenSetResult} from "../types.js";
import {deferredFactory, promiseWait, sleep} from "../helpers/utils.js";
import type {Deferred} from "../helpers/utils.js";
import {is} from "typia";
import {setImmediate} from "timers";
import {LRUCache} from "lru-cache";

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
    private pendingRefresh = new LRUCache<string, Deferred<RefreshTokenSet | undefined>>({
        max: 10000,
        ttl: AbstractTokenCache.REFRESH_HOLDOVER_WINDOW_SECS * 1000,
    });

    private constructor(config: TokenCacheConfig) {
        super(config);

        // Check for a cluster provider
        if (config.clusterProvider === undefined) {
            throw new Error(`Cannot initialize ${this.constructor.name} without a cluster provider.`);
        }

        // Store reference to the cluster provider
        this.clusterProvider = config.clusterProvider;

    }

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