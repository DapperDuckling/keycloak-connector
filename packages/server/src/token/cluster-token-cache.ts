import {AbstractTokenCache} from "./abstract-token-cache.js";
import type {TokenCacheConfig} from "./abstract-token-cache.js";
import {AbstractClusterProvider, BaseClusterEvents} from "../cluster/abstract-cluster-provider.js";
import type {RefreshTokenSetResult} from "../types.js";
import * as jose from "jose";
import {promiseWait, sleep} from "../helpers/utils.js";

export class ClusterTokenCache extends AbstractTokenCache {

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

        // Record start time
        const attemptStartTime = Date.now();
        const lastRetryTime = attemptStartTime + AbstractTokenCache.MAX_WAIT_SECS * 1000;

        do {

            // Grab existing update promise (if any)

                // Has existing update --> wait here for max time
                    // Return result or return undefined

            // Add token id to list of IDs to listen for if a refresh token result comes through

            // Get a lock
                // No lock

                //









            // Grab existing update promise (if any)
            const existingRefreshPromise = this.pendingRefresh.get(updateId);

            // Check for existing update
            if (existingRefreshPromise) {
                // Wait for the result
                const tokenSet = await promiseWait(existingRefreshPromise, lastRetryTime).catch(() => undefined);

                // Check for a result, don't update cookies here since another connection is already handling that
                if (tokenSet) return {
                    refreshTokenSet: tokenSet,
                    shouldUpdateCookies: false,
                }

                // Delay and start from the top again
                await sleep(0, 250);
                continue;
            }

            // No existing update or no data returned

            try {
                // Get reference to token refresh promise
                const tokenRefreshPromise = this.performTokenRefresh(validatedRefreshJwt);

                // Grab a lock by setting the value here
                // Dev note: There is no race condition since the LRUCache is synchronous
                this.pendingRefresh.set(updateId, tokenRefreshPromise);

                // Refresh the token
                const tokenSet = await tokenRefreshPromise;

                // Check for a new token set, do update the cookies here
                if (tokenSet) return {
                    refreshTokenSet: tokenSet,
                    shouldUpdateCookies: true,
                }
            } catch (e) {
                // Log error
                this.config.pinoLogger?.warn(`Failed perform token refresh: ${e}`);
            }

            // Release the lock
            this.pendingRefresh.delete(validatedRefreshJwt);

            // Delay and loop
            await sleep(0, 250);

        } while (Date.now() <= lastRetryTime);

        // Could not refresh in time
        return undefined;


        return Promise.resolve(undefined);
    };
}