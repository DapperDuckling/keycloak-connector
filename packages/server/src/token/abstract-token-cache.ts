import type {KeycloakConnectorInternalConfiguration, RefreshTokenSetResult, RefreshTokenSet} from "../types.js";
import type {TokenSet} from "openid-client";
import type {Logger} from "pino";
import {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import type {BaseClient} from "openid-client";
import {errors} from "openid-client";
import OPError = errors.OPError;
import * as jose from 'jose';

export interface TokenCacheConfig {
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
    oidcClient: BaseClient,
}

export type TokenCacheProvider = (...args: ConstructorParameters<typeof AbstractTokenCache>) => Promise<AbstractTokenCache>;
export abstract class AbstractTokenCache {

    protected static MAX_UPDATE_JWT_ID_LENGTH = 1000;
    protected static MAX_WAIT_SECS = 15;
    protected static REFRESH_HOLDOVER_WINDOW_SECS = 60;
    protected config: TokenCacheConfig;
    protected pinoLogger: Logger | undefined = undefined;

    constructor(config: TokenCacheConfig) {
        this.config = config;
    }

    public abstract refreshTokenSet(refreshJwt: string, accessJwt?: string): Promise<RefreshTokenSetResult | undefined>;

    protected performTokenRefresh = async (refreshJwt: string): Promise<RefreshTokenSet | undefined> => {
        // Perform the refresh
        const tokenSet = await this.config.oidcClient.refresh(refreshJwt);

        // Check for an access token
        if (tokenSet.access_token === undefined)
            throw new OPError({error: `Missing access token in refresh response`});

        // Check for a refresh token
        if (tokenSet.refresh_token === undefined)
            throw new OPError({error: `Missing refresh token in refresh response`});

        return {
            access_token: tokenSet.access_token,
            refresh_token: tokenSet.refresh_token,
            accessToken: jose.decodeJwt(tokenSet.access_token),
            ...tokenSet,
        }

    };

    static provider: TokenCacheProvider;
}