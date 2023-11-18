import type {CacheAdapterConfig} from "./abstract-cache-adapter.js";
import {AbstractCacheAdapter} from "./abstract-cache-adapter.js";
import type {BaseClient, UserinfoResponse} from "openid-client";
import {cacheFactory} from "../cache/cache-factory.js";
import {CacheProvider} from "../cache/cache-provider.js";
import {errors} from "openid-client";
import RPError = errors.RPError;

export type UserInfoCacheConfig = CacheAdapterConfig & {
    oidcClient: BaseClient,
}

export class UserInfoCache extends AbstractCacheAdapter<UserinfoResponse, [string]> {

    protected override config: UserInfoCacheConfig;
    protected cacheProvider: CacheProvider<UserinfoResponse, [string]>;

    constructor(config: UserInfoCacheConfig) {
        super(config);
        this.config = config;

        this.cacheProvider = cacheFactory<UserinfoResponse, [string]>({
            ...this.cacheConfig,
            title: `UserInfoCache`,
            ttl: 3600,
            cacheMissCallback: this.fetchUserInfo,
        });
    }

    async invalidateFromJwt(validatedJwt: string) {
        await this.cacheProvider.invalidateFromJwt(validatedJwt, 'jti');
    }

    getUserInfo = async (validatedAccessJwt: string): Promise<UserinfoResponse | undefined> => {
        // Grab the user info from cache (or generate it into cache)
        const cacheResult = await this.cacheProvider.getFromJwt(validatedAccessJwt, 'jti', [validatedAccessJwt]);

        // Log the error
        if (cacheResult.error) {
            this.config.pinoLogger?.debug(cacheResult.error);
        }

        // Return the data or undefined on error
        return (!cacheResult.error) ? cacheResult.data : undefined;
    }

    private fetchUserInfo = async (validatedAccessJwt: string): Promise<UserinfoResponse> => {
        try {
            return await this.config.oidcClient.userinfo(validatedAccessJwt);
        } catch (e) {
            // Check for a server misconfiguration
            if (e instanceof RPError && e.message.includes("expected application/jwt response")) {
                this.config.pinoLogger?.error(`Keycloak misconfiguration! See keycloak-connector-server readme for proper client configuration. (Need to set signature algorithm)`);
            }

            this.config.pinoLogger?.debug(e);
            throw new Error(`Failed to fetch user info from keycloak`);
        }
    }
}
