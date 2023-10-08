import type {RefreshTokenSetResult, RefreshTokenSet} from "../types.js";
import type {Logger} from "pino";
import {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import type {BaseClient} from "openid-client";
import {errors} from "openid-client";
import OPError = errors.OPError;
import * as jose from 'jose';
import {LRUCache} from "lru-cache";
import {EventEmitter} from "node:events";
import {promiseWait, WaitTimeoutError} from "../helpers/utils.js";
import {webcrypto} from "crypto";
import type {CacheProvider} from "../cache/cache-provider.js";

export interface TokenCacheConfig {
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
    oidcClient: BaseClient,
}

export type HandleRefreshToken = {
    updateId: string;
    validatedRefreshJwt: string;
    isFirstThisNode: boolean;
}

export type TokenCacheProvider = (...args: ConstructorParameters<typeof TokenCache>) => Promise<TokenCache>;
export abstract class TokenCache {

    private static MAX_UPDATE_JWT_ID_LENGTH = 1000;
    private config: TokenCacheConfig;
    private cacheProvider: CacheProvider<RefreshTokenSet, [string]>;

    constructor(config: TokenCacheConfig) {
        this.config = config;

        this.cacheProvider = new Cac
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

        // Handle

        return refreshTokenSetResult;
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

    static provider: TokenCacheProvider;
}