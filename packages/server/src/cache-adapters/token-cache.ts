import type {RefreshTokenSet, RefreshTokenSetResult} from "../types.js";
import type {BaseClient, TokenSet} from "openid-client";
import * as jose from 'jose';
import type {CacheProvider} from "../cache/cache-provider.js";
import {cacheFactory} from "../cache/cache-factory.js";
import type {CacheAdapterConfig} from "./abstract-cache-adapter.js";
import {AbstractCacheAdapter} from "./abstract-cache-adapter.js";

export type TokenCacheConfig = CacheAdapterConfig & {
    oidcClient: BaseClient,
}

export type TokenCacheProvider = (...args: ConstructorParameters<typeof TokenCache>) => Promise<TokenCache>;

export class TokenCache extends AbstractCacheAdapter<RefreshTokenSet, [string]> {

    protected static REFRESH_HOLDOVER_WINDOW_SECS = 60; // Will be up to double this value if cluster cache is used

    protected override config: TokenCacheConfig;
    protected cacheProvider: CacheProvider<RefreshTokenSet, [string]>;

    constructor(config: TokenCacheConfig) {
        super(config);
        this.config = config;

        this.cacheProvider = cacheFactory<RefreshTokenSet, [string]>({
            ...this.cacheConfig,
            title: `TokenCache`,
            ttl: TokenCache.REFRESH_HOLDOVER_WINDOW_SECS,
            cacheMissCallback: this.performTokenRefresh,
        });
    }

    async invalidateFromJwt(validatedJwt: string) {
        await this.cacheProvider.invalidateFromJwt(validatedJwt, 'jti');
    }

    refreshTokenSet = async (validatedRefreshJwt: string): Promise<RefreshTokenSetResult | undefined> => {

        // Grab the token set from cache (or generate it into cache)
        const cacheResult = await this.cacheProvider.getFromJwt(validatedRefreshJwt, 'jti', [validatedRefreshJwt]);

        // Log the error
        if (cacheResult.error) {
            this.config.pinoLogger?.debug(cacheResult.error);
        }

        return (!cacheResult.error) ? {
            refreshTokenSet: cacheResult.data,
            shouldUpdateCookies: cacheResult.dataGenerator ?? false
        } : undefined; // Ignore the error
    }

    protected performTokenRefresh = async (validatedRefreshJwt: string): Promise<RefreshTokenSet> => {

        let tokenSet: TokenSet;

        try {
            // Perform the refresh
            tokenSet = await this.config.oidcClient.refresh(validatedRefreshJwt);
        } catch (e) {
            // Do not dump the error if the token is only not active
            if (e instanceof Error &&
                e.message.includes('Token is not active')) {
                throw new Error(`Refresh token is not active, cannot perform token refresh`);
            }

            this.config.pinoLogger?.debug(e);
            throw new Error(`Failed to perform token refresh`);
        }

        // Check for an access token
        if (tokenSet.access_token === undefined) {
            throw new Error(`Missing access token in refresh response`);
        }

        // Check for a refresh token
        if (tokenSet.refresh_token === undefined) {
            throw new Error(`Missing refresh token in refresh response`);
        }

        return {
            ...tokenSet,
            access_token: tokenSet.access_token,
            refresh_token: tokenSet.refresh_token,
            accessToken: jose.decodeJwt(tokenSet.access_token),
        }

    };
}
