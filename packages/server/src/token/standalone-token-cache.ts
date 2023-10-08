import {TokenCache} from "./token-cache.js";
import type {TokenCacheProvider} from "./token-cache.js";
import type {RefreshTokenSetResult} from "../types.js";

export class StandaloneTokenCache extends TokenCache {

    protected handleTokenRefresh = async (updateId: string, validatedRefreshJwt: string): Promise<RefreshTokenSetResult | undefined> => {

        let refreshTokenSet;

        try {
            // Perform the token refresh
            refreshTokenSet = await this.performTokenRefresh(validatedRefreshJwt);

        } catch (e) {
            // Log error
            this.config.pinoLogger?.warn(e, `Failed to perform token refresh`);
        }

        // Return the result of the refresh or undefined
        return (refreshTokenSet) ? {
            refreshTokenSet: refreshTokenSet,
            shouldUpdateCookies: true,
        } : undefined;
    }

    static override provider: TokenCacheProvider = async (...args: ConstructorParameters<typeof TokenCache>) => {
        return new this(...args);
    }
}