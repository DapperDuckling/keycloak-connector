import {AbstractTokenCache} from "./abstract-token-cache.js";
import type {TokenCacheProvider} from "./abstract-token-cache.js";
import type {RefreshTokenSetResult, RefreshTokenSet} from "../types.js";
import {LRUCache} from "lru-cache";
import {promiseWait, sleep, WaitTimeoutError} from "../helpers/utils.js";
import * as jose from 'jose';

export class StandaloneTokenCache extends AbstractTokenCache {

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
            const existingRefreshPromise = this.pendingRefresh.get(updateId);

            // Check for existing update
            if (existingRefreshPromise) {

                // Wait for the result
                const tokenSet: RefreshTokenSet | undefined = await promiseWait(existingRefreshPromise, lastRetryTime).catch(e => {
                    if (e instanceof WaitTimeoutError) {
                        // Log this in order to inform the owner they may need to increase the wait timeout
                        this.config.pinoLogger?.warn(`Timed out waiting for refresh token update promise to complete. May consider increasing the wait time or investigating why the request is taking so long.`);
                    }

                    return undefined;
                });

                // Check for a result, don't update cookies here since another connection is already handling that
                if (tokenSet) return {
                    refreshTokenSet: tokenSet,
                    shouldUpdateCookies: false,
                }

                continue;
            }

            // No existing update

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
                this.config.pinoLogger?.warn(`Failed perform token refresh`, e);
            }

            // Release the lock
            this.pendingRefresh.delete(updateId);

        } while (
            Date.now() <= lastRetryTime &&         // Check exit condition
            await sleep(25, 150)   // Add some random sleep for next loop
        );

        // Could not refresh in time
        return undefined;
    };

    static override provider: TokenCacheProvider = async (...args: ConstructorParameters<typeof AbstractTokenCache>) => {
        return new this(...args);
    }
}