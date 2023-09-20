import {AbstractTokenCache} from "./abstract-token-cache.js";
import type {RefreshTokenSetResult} from "../types.js";
import {LRUCache} from "lru-cache";
import {promiseWait, sleep} from "../helpers/utils.js";
import {TokenSet} from "openid-client";
import * as jose from 'jose';

export class StandaloneTokenCache extends AbstractTokenCache {

    private pendingRefresh = new LRUCache<string, Promise<TokenSet | undefined>>({
        max: 10000,
        ttl: AbstractTokenCache.REFRESH_HOLDOVER_WINDOW_SECS * 60,
    });

    refreshTokenSet = async (validatedRefreshJwt: string): Promise<RefreshTokenSetResult | undefined> => {

        // Decode JWTs
        const refreshToken = await jose.decodeJwt(validatedRefreshJwt);

        // Make the update id the JWT ID
        const updateId = refreshToken.jti;

        // Check for a valid id
        if (updateId === undefined) {
            this.config.pinoLogger?.error('No JWT ID found on a validated refresh token. This should never happen!');
            return undefined;
        }

        // Record start time
        const attemptStartTime = Date.now();
        const lastRetryTime = attemptStartTime + AbstractTokenCache.MAX_WAIT_SECS * 1000;

        do {
            // Grab existing update promise (if any)
            const existingRefreshPromise = this.pendingRefresh.get(updateId);

            // Check for existing update
            if (existingRefreshPromise) {
                // Wait for the result
                const tokenSet = await existingRefreshPromise;

                // Check for a result, don't update cookies here since another connection is already handling that
                if (tokenSet) return {
                    tokenSet: tokenSet,
                    shouldUpdateCookies: false,
                }

                // Delay and start from the top again
                await sleep(0, 250);
                continue;
            }

            // No existing update or no data returned

            // Get reference to token refresh promise
            const tokenRefreshPromise = this.performTokenRefresh(validatedRefreshJwt);

            // Grab a lock by setting the value here
            // Dev note: There is no race condition since the LRUCache is synchronous
            this.pendingRefresh.set(updateId, tokenRefreshPromise);

            try {
                // Refresh the token
                const tokenSet = await tokenRefreshPromise;

                // Check for a new token set, do update the cookies here
                if (tokenSet) return {
                    tokenSet: tokenSet,
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
    };

    static factory = (...args: ConstructorParameters<typeof AbstractTokenCache>) => {
        return new this(...args);
    }
}