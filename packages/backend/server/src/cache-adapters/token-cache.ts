import type {ExtendedRefreshTokenSet, RefreshTokenSetResult} from "../types.js";
import * as jose from 'jose';
import type {CacheProvider} from "../cache/cache-provider.js";
import {cacheFactory} from "../cache/cache-factory.js";
import type {CacheAdapterConfig} from "./abstract-cache-adapter.js";
import {AbstractCacheAdapter} from "./abstract-cache-adapter.js";
import {isObject} from "@dapperduckling/keycloak-connector-common";
import * as OpenidClient from "openid-client";
import type {TokenEndpointResponse} from "oauth4webapi";

export type TokenCacheConfig = CacheAdapterConfig & {
    oidcConfig: OpenidClient.Configuration,
}

export type TokenCacheProvider = (...args: ConstructorParameters<typeof TokenCache>) => Promise<TokenCache>;

export class TokenCache extends AbstractCacheAdapter<ExtendedRefreshTokenSet, [string]> {

    protected static REFRESH_HOLDOVER_WINDOW_SECS = 60; // Will be up to double this value if cluster cache is used

    protected override config: TokenCacheConfig;
    protected cacheProvider: CacheProvider<ExtendedRefreshTokenSet, [string]>;

    constructor(config: TokenCacheConfig) {
        super(config);
        this.config = config;

        this.cacheProvider = cacheFactory<ExtendedRefreshTokenSet, [string]>({
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

        return (cacheResult) ? {
            extendedRefreshTokenSet: cacheResult.data,
            shouldUpdateCookies: cacheResult.dataGenerator ?? false
        } : undefined;
    }

    protected performTokenRefresh = async (validatedRefreshJwt: string): Promise<ExtendedRefreshTokenSet | undefined> => {

        let tokenSet: TokenEndpointResponse;

        try {
            // Perform the refresh
            tokenSet = await OpenidClient.refreshTokenGrant(this.config.oidcConfig, validatedRefreshJwt);
        } catch (e) {
            // Do not dump the error if the token is only not active
            if (e instanceof Error &&
                e.message.includes('Token is not active')) {
                this.config.pinoLogger?.debug(`Refresh token is not active, cannot perform token refresh`);
                return;
            }

            if (isObject(e)) this.config.pinoLogger?.debug(e);
            this.config.pinoLogger?.debug(`Failed to perform token refresh`);
            return;
        }

        // Check for an access token
        if (tokenSet.access_token === undefined) {
            this.config.pinoLogger?.error(`Missing access token in refresh response`);
            return undefined;
        }

        // Check for a refresh token
        if (tokenSet.refresh_token === undefined) {
            this.config.pinoLogger?.error(`Missing refresh token in refresh response`);
            return undefined;
        }

        // Check for an expiration time
        if (tokenSet.expires_in === undefined) {
            this.config.pinoLogger?.error(`Missing "expires_in" in refresh response`);
            return undefined;
        }

        return {
            tokenSet: {
                ...tokenSet,
                refresh_token: tokenSet.refresh_token,
            },
            accessToken: jose.decodeJwt(tokenSet.access_token),
            expiresAt: Math.floor(Date.now() / 1000) + tokenSet.expires_in,
        }

    };
}
