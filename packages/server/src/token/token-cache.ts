import type {RefreshTokenSet, RefreshTokenSetResult} from "../types.js";
import type {Logger} from "pino";
import {AbstractClusterProvider} from "../cluster/index.js";
import type {BaseClient} from "openid-client";
import {errors} from "openid-client";
import OPError = errors.OPError;
import * as jose from 'jose';
import type {CacheProvider} from "../cache/cache-provider.js";
import {cacheFactory} from "../cache/cache-factory.js";

export interface TokenCacheConfig {
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
    oidcClient: BaseClient,
}

export type TokenCacheProvider = (...args: ConstructorParameters<typeof TokenCache>) => Promise<TokenCache>;
export abstract class TokenCache {

    protected static MAX_UPDATE_JWT_ID_LENGTH = 1000;
    protected static REFRESH_HOLDOVER_WINDOW_SECS = 60; // Will be up to double this value if cluster cache is used

    private config: TokenCacheConfig;
    private cacheProvider: CacheProvider<RefreshTokenSet, [string]>;

    constructor(config: TokenCacheConfig) {
        this.config = config;

        this.cacheProvider = cacheFactory<RefreshTokenSet>({
            title: `TokenCache`,
            ...this.config.pinoLogger && {pinoLogger: this.config.pinoLogger},
            ...this.config.clusterProvider && {clusterProvider: this.config.clusterProvider},
            ttl: TokenCache.REFRESH_HOLDOVER_WINDOW_SECS,
            cacheMissCallback: this.performTokenRefresh,
        });
    }

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
        if (updateId.length > TokenCache.MAX_UPDATE_JWT_ID_LENGTH) {
            this.config.pinoLogger?.error(`JWT ID length exceeded ${TokenCache.MAX_UPDATE_JWT_ID_LENGTH}, received ${updateId.length} characters`);
            return undefined;
        }

        // Grab the token set from cache (or generate it into cache)
        const cacheResult = await this.cacheProvider.get(updateId, [validatedRefreshJwt]);

        return (cacheResult) ? {
            refreshTokenSet: cacheResult.data,
            shouldUpdateCookies: cacheResult.dataGenerator ?? false
        } : undefined;
    }

    protected performTokenRefresh = async (validatedRefreshJwt: string): Promise<RefreshTokenSet | undefined> => {
        // Perform the refresh
        const tokenSet = await this.config.oidcClient.refresh(validatedRefreshJwt);

        // Check for an access token
        if (tokenSet.access_token === undefined)
            throw new OPError({error: `Missing access token in refresh response`});

        // Check for a refresh token
        if (tokenSet.refresh_token === undefined)
            throw new OPError({error: `Missing refresh token in refresh response`});

        return {
            ...tokenSet,
            access_token: tokenSet.access_token,
            refresh_token: tokenSet.refresh_token,
            accessToken: jose.decodeJwt(tokenSet.access_token),
        }

    };
}