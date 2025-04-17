import type {CacheAdapterConfig} from "./abstract-cache-adapter.js";
import {AbstractCacheAdapter} from "./abstract-cache-adapter.js";
import {cacheFactory} from "../cache/cache-factory.js";
import {CacheProvider} from "../cache/cache-provider.js";
import {isObject} from "@dapperduckling/keycloak-connector-common";
import * as OpenidClient from "openid-client";
import {type UserInfoResponse} from "oauth4webapi";
import * as jose from "jose";
import {WWWAuthenticateChallengeError} from "openid-client";

export type UserInfoCacheConfig = CacheAdapterConfig & {
    oidcConfig: OpenidClient.Configuration,
}

export class UserInfoCache extends AbstractCacheAdapter<UserInfoResponse, [string]> {

    protected override config: UserInfoCacheConfig;
    protected cacheProvider: CacheProvider<UserInfoResponse, [string]>;

    constructor(config: UserInfoCacheConfig) {
        super(config);
        this.config = config;

        this.cacheProvider = cacheFactory<UserInfoResponse, [string]>({
            ...this.cacheConfig,
            title: `UserInfoCache`,
            ttl: 3600,
            cacheMissCallback: this.fetchUserInfo,
        });
    }

    async invalidateFromJwt(validatedJwt: string) {
        await this.cacheProvider.invalidateFromJwt(validatedJwt, 'sid');
    }

    getUserInfo = async (validatedAccessJwt: string): Promise<UserInfoResponse | undefined> => {
        // Grab the user info from cache (or generate it into cache)
        const cacheResult = await this.cacheProvider.getFromJwt(validatedAccessJwt, 'sid', [validatedAccessJwt]);

        // Return just the data
        return cacheResult?.data;
    }

    private fetchUserInfo = async (validatedAccessJwt: string): Promise<UserInfoResponse | undefined> => {
        try {
            // Grab the subject from the access token
            const jwtSubject = jose.decodeJwt(validatedAccessJwt).sub;

            // Ensure a subject exists
            if (jwtSubject === undefined) {
                this.config.pinoLogger?.error(`Failed to find a "sub" claim in access token, unable to perform user introspect. Enable "debug" log levels to see access token`);
                this.config.pinoLogger?.debug(validatedAccessJwt);
                return;
            }

            return await OpenidClient.fetchUserInfo(this.config.oidcConfig, validatedAccessJwt, jwtSubject);
        } catch (e) {
            // Check for a server misconfiguration
            if (e instanceof Error) {

                // Check for known issues
                if (e.message.includes("expected application/jwt response") ||
                    e.message.includes("JWT UserInfo Response expected")) {
                    this.config.pinoLogger?.error(`Possible Keycloak misconfiguration! See documentation for proper client configuration. (Need to set signature algorithm)`);

                } else if (e instanceof WWWAuthenticateChallengeError) {
                    // Check for (likely) revoked access token
                    this.config.pinoLogger?.warn(`Server validated access token rejected by Keycloak. Likely due to a user attempting to token after an administrator manually revoked the token.`);

                } else {
                    this.config.pinoLogger?.debug(e);
                }
            }

            this.config.pinoLogger?.debug(`Failed to fetch user info from keycloak`);
        }

        return;
    }
}
