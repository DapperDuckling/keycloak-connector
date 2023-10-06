import {AbstractTokenCache} from "./abstract-token-cache.js";
import type {TokenCacheProvider} from "./abstract-token-cache.js";
import type {RefreshTokenSetResult} from "../types.js";

export class StandaloneTokenCache extends AbstractTokenCache {

    protected handleTokenRefresh = async (updateId: string, validatedRefreshJwt: string): Promise<RefreshTokenSetResult | undefined> => {

        let refreshTokenSet;

        try {
            // Perform the token refresh
            refreshTokenSet = await this.performTokenRefresh(validatedRefreshJwt);

        } catch (e) {
            // Log error
            this.config.pinoLogger?.warn(`Failed perform token refresh`, e);
        }

        // Return the result of the refresh or undefined
        return (refreshTokenSet) ? {
            refreshTokenSet: refreshTokenSet,
            shouldUpdateCookies: true,
        } : undefined;
    }

    static override provider: TokenCacheProvider = async (...args: ConstructorParameters<typeof AbstractTokenCache>) => {
        return new this(...args);
    }
}