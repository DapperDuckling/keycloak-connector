import {AbstractTokenCache} from "./abstract-token-cache.js";
import type {RefreshTokenSetResult} from "../types.js";
import {LRUCache} from "lru-cache";
import {promiseWait, sleep} from "../helpers/utils.js";
import {TokenSet} from "openid-client";

class StandaloneTokenCache extends AbstractTokenCache {

    protected MAX_WAIT_SECS = 15;

    private pendingRefresh = new LRUCache<string, Promise<TokenSet | undefined>>({
        max: 10000,
    });

    refreshTokenSet = async (refreshJwt: string, accessJwt?: string): Promise<RefreshTokenSetResult | undefined> => {

        const cacheId = refreshJwt + ((accessJwt !== undefined) ? `::${accessJwt}` : '');

        // Record start time
        const attemptStartTime = Date.now()/1000;

        // Grab existing update
        const existingRefreshPromise = this.pendingRefresh.get(cacheId);

        // Check for a refresh result from the pending request
        if (existingRefreshPromise) {
            try {
                // Wait for the previous attempt to end
                const tokenSet = await promiseWait<TokenSet | undefined>(existingRefreshPromise, attemptStartTime, this.MAX_WAIT_SECS);

                // Return the token set if it came through, otherwise do not return anything
                return (tokenSet) ? {
                    tokenSet: tokenSet,
                    shouldUpdateCookies: false,
                } : undefined;
            } catch (e) {}

            // No data, return from promise
            return;
        }

        // Build the promise wrapping the token refresh operation
        const refreshPromise = async () => {
            return await this.configuration.oidcClient.refresh(refreshJwt);
        }

        // Store the refresh promise for later reuse
        this.pendingRefresh.set(cacheId, refreshPromise(), {
            ttl: AbstractTokenCache.REFRESH_HOLDOVER_WINDOW_SECS * 60,
        });

        // Wait for the refresh results
        const tokenSet = await refreshPromise();

        // Return the token set if it came through, otherwise do not return anything
        return (tokenSet) ? {
            tokenSet: tokenSet,
            shouldUpdateCookies: true,
        } : undefined;

    };
}