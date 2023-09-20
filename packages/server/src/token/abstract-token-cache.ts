import type {KeycloakConnectorInternalConfiguration, RefreshTokenSetResult} from "../types.js";
import type {TokenSet} from "openid-client";
import type {Logger} from "pino";
import {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import type {BaseClient} from "openid-client";

export interface TokenCacheConfig {
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
    oidcClient: BaseClient,
}

export type TokenCacheProvider = (...args: ConstructorParameters<typeof AbstractTokenCache>) => Promise<AbstractTokenCache>;
export abstract class AbstractTokenCache {

    protected static MAX_WAIT_SECS = 15;
    protected static REFRESH_HOLDOVER_WINDOW_SECS = 60;
    protected config: TokenCacheConfig;
    protected pinoLogger: Logger | undefined = undefined;

    constructor(config: TokenCacheConfig) {
        this.config = config;
    }

    public abstract refreshTokenSet(refreshJwt: string, accessJwt?: string): Promise<RefreshTokenSetResult | undefined>;

    protected performTokenRefresh = async (refreshJwt: string): Promise<TokenSet | undefined> => {
        return await this.config.oidcClient.refresh(refreshJwt);
    };

    static provider: TokenCacheProvider;
}