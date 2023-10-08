import type {CacheAdapterConfig} from "./abstract-cache-adapter.js";
import {AbstractCacheAdapter} from "./abstract-cache-adapter.js";
import {BaseClient, UserinfoResponse} from "openid-client";
import {cacheFactory} from "../cache/cache-factory.js";
import {RefreshTokenSet} from "../types.js";

export type UserInfoCacheConfig = CacheAdapterConfig & {
    oidcClient: BaseClient,
}

export class UserInfoCache extends AbstractCacheAdapter<UserinfoResponse, [string]> {

    private config: UserInfoCacheConfig;

    constructor(config: UserInfoCacheConfig) {
        super(config);
        this.config = config;

        this.cacheProvider = cacheFactory<RefreshTokenSet, [string]>({
            ...this.cacheConfig,
            title: `UserInfoCache`,
            ttl: 3600,
            cacheMissCallback: this.fetchUserInfo,
        });
    }

    getUserInfo = async (validatedAccessJwt: string): Promise<UserinfoResponse | undefined> => {
        // Grab the user info from cache (or generate it into cache)
        return await this.cacheProvider.getFromJwt(validatedAccessJwt);
    }

    private fetchUserInfo = async (validatedAccessJwt: string): Promise<UserinfoResponse | undefined> => {
        try {
            return await this.config.oidcClient.userinfo(validatedAccessJwt);
        } catch (e) {
            this.config.pinoLogger?.debug(e, `Failed to fetch user info from keycloak`);
        }

        return undefined;
    }
}