import type {KeycloakConnectorInternalConfiguration, RefreshTokenSetResult} from "../types.js";
import type {TokenSet} from "openid-client";
import type {Logger} from "pino";
import {StandaloneTokenCache} from "./standalone-token-cache.js";
import type {Constructor} from "../generics.js";

export interface TokenCacheConfig {
    internalKcConfig: KeycloakConnectorInternalConfiguration;
    pinoLogger?: Logger;
}

// export type TokenCacheProviderArgs = ConstructorParameters<typeof AbstractTokenCache>;
// export type TokenCacheProvider = (c: Constructor<AbstractTokenCache, TokenCacheProviderArgs>, ...args: TokenCacheProviderArgs) => Promise<AbstractTokenCache>;
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
        return await this.config.internalKcConfig.oidcClient.refresh(refreshJwt);
    };

    // protected static factory: TokenCacheProvider = async (c, ...args) => {
    //     return new c(...args);
    // };
}