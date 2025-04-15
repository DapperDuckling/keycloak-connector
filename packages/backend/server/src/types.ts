import type {ClientMetadata, JsonValue} from "openid-client";
import type * as OpenidClient from "openid-client";
import type {CookieSerializeOptions} from "@fastify/cookie";
import type {CookieOptions} from "express-serve-static-core";
import type {Logger} from "pino";
import type {IncomingHttpHeaders} from "node:http";
import type {JWTPayload} from "jose/dist/types/types.js";
import type {AbstractKeyProvider, KeyProviderConfig} from "./crypto/index.js";
import type {AbstractClusterProvider} from "./cluster/index.js";
import {TokenCache} from "./cache-adapters/index.js";
import {UserInfoCache} from "./cache-adapters/index.js";
import type {KeycloakConnector} from "./keycloak-connector.js";
import {CustomRouteUrl, SilentLoginTypes, UserStatus} from "@dapperduckling/keycloak-connector-common";
import {CookieStore} from "./cookie-store.js";
import type {DecorateUserStatusBackend} from "./auth-plugins/index.js";
import type {TokenEndpointResponse, UserInfoResponse} from "oauth4webapi";
import type {JWK} from "jose";

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface KeycloakConnectorInternalConfiguration {
    oidcDiscoveryUrl: string;
    oidcConfig: OpenidClient.Configuration;
    keyProvider: AbstractKeyProvider;
    tokenCache: TokenCache;
    userInfoCache: UserInfoCache;
    remoteJWKS: () => Promise<CryptoKey>;
    notBefore?: number;
}

export type ConnectorKeys = {
    kid: string,
    alg: string,
    publicKey: CryptoKey,
    privateKey: CryptoKey,
    publicJwk: JWK,
    privateJwk: JWK,
}

export type KeycloakConnectorExposedProperties = ReturnType<KeycloakConnector<any>['getExposed']>;

export type KeycloakConnectorConfigCustom =
    Omit<Partial<KeycloakConnectorConfigBase>, 'oidcClientMetadata'> &
    Pick<KeycloakConnectorConfigBase, 'authServerUrl' | 'realm' | 'serverOrigin'> & {
    oidcClientMetadata?: Partial<ClientMetadata> & {
        /** @deprecated Use {@link KeycloakConnectorConfigBase#redirectUris} */
        redirect_uris?: string[],
        /** @deprecated Use {@link KeycloakConnectorConfigBase#postLogoutRedirectUris} */
        post_logout_redirect_uris?: string[],
    },
}

export enum StateOptions {
    STATELESS = 0,
    MIXED = 1,
    STATEFUL = 2,
}

export const VerifiableJwtTokenTypes = {
    ID: "ID",
    LOGOUT: "Logout",
    ACCESS: "Bearer",
    JARM: "JWT",
    STATE: "STATE",
    // REFRESH token is NOT verifiable. Keycloak uses symmetric signature (HS256) on these tokens.
} as const;

export interface KeycloakConnectorConfigBase {
    /** The RP server origin */
    serverOrigin: string;

    /** The OP server url */
    authServerUrl: string;

    /** Authorized origins */
    validOrigins?: string[];

    /** Override default redirect uri **/
    redirectUri?: string;

    /** The keycloak client id **/
    clientId?: string;

    /** The keycloak client secret **/
    clientSecret?: string;

    /** Only allows the server to validate the access token, the server will not attempt to refresh if it is invalid */
    validateAccessOnly?: boolean;
    readOnlyServer?: boolean;

    /** Option to disable signed JWT authentication **/
    DANGEROUS_disableJwtClientAuthentication?: boolean;

    /** The OP realm to use */
    realm: string;

    /** The RP client data */
    oidcClientMetadata: ClientMetadata;

    /** TLDR; KC versions < 18 have the /auth _prefix in the url */
    keycloakVersionBelow18?: boolean;

    /** How often should we ping the OP for an updated oidc configuration */
    refreshConfigMins?: number;

    /** Override valid redirect uris for post-login */
    redirectUris?: string[];

    /** Override valid redirect uris for post-logout */
    postLogoutRedirectUris?: string[];

    /** Pino logger reference */
    pinoLogger?: Logger;

    /** Custom oidc discovery url */
    oidcDiscoveryUrlOverride?: string;

    /** Determines where the client will store a user's oauth token information */
    stateType?: StateOptions

    /**
     *  How long until the initial login sequence cookie expires. Shorter times may impact users who may take a while
     *  to finish logging in.
     */
    authCookieTimeout: number;

    /** Overrides the default routes created to handle keycloak interactions */
    routePaths?: CustomRouteUrl;

    /** Overrides the default configuration for all routes */
    globalRouteConfig?: KeycloakRouteConfig;

    /**
     * When a role rule doesn't specify a specific client, the default is to use the current `client_id` when
     * searching through the `resource_access` key of the JWT for required roles. Overridable here.
     */
    defaultResourceAccessKey?: string;

    /** When true, a case-sensitive search is used to match requirements to user's roles */
    caseSensitiveRoleCheck?: boolean;

    // /** Optional claims required when verifying user-provided JWTs */
    // jwtClaims?: {
    //     /** Require the user-provided JWT to be intended for a particular audience */
    //     audience?: string;
    //
    //     /** Ensures the party to which the JWT was issued matches provided value. By default, azp must match the current `client_id` */
    //     azp?: string | AzpOptions;
    // }

    /** Specify a cluster provider in order to synchronize instances of the same app */
    clusterProvider?: AbstractClusterProvider;

    /** Allows you to specify a built-in or pass a custom key provider */
    keyProvider?: KeyProvider;

    /** Forces the server to validate all access tokens provided by during a user request, regardless of route */
    alwaysVerifyAccessTokenWithServer?: boolean;

    /**
     * Requires server to fetch user info for each validated access token
     * @default true
     */
    fetchUserInfo?: boolean | ((userInfo: UserInfoResponse) => UserInfoResponse);

    /**
     * Holds the base domain used for setting the wildcard domain property of cookies sent to the browser.
     * Allows cookies to be accessible across all subdomains of the specified base domain and
     * the base domain itself.
     */
    wildcardCookieBaseDomain?: string;

    /** Allows decoration of the user status endpoint */
    decorateUserStatus?: DecorateUserStatusBackend;

    /**
     * @desc    The amount of time in minutes the client should attempt to refresh the access token in order
     *          to keep it from expiring (NOTE: KCC server MUST be configured with a time at or greater).
     *          Set false to disable.
     * @default 5 minutes (normally) or false (if `readOnlyServer` or `validateAccessOnly` is true)
     */
    eagerRefreshTime?: number | false;

    /**
     *
     */
    errorResponseHandler?: ErrorResponseHandler;
}

export type ErrorResponseHandler = (statusCode: number) => ConnectorResponse<any> | undefined;

export type KeyProvider = (keyProviderConfig: KeyProviderConfig) => Promise<AbstractKeyProvider>;

export type Listener<R = void, A extends any[] | [] = any[]> = (...args: A) => R;

export enum AzpOptions {
    MATCH_CLIENT_ID_IF_PRESENT = 0,
    IGNORE = 1,
}

export type ReqCookies = { [cookieName: string]: string | undefined };

export type PluginDecorators = Record<string, unknown>;

export type JsonCompatibleClaims<T> = {
    [K in keyof T]: JsonValue | undefined;
};


export interface ConnectorRequest<
    KcRouteConfig extends object = Record<string, unknown>,
    KcClaims extends JsonCompatibleClaims<KcClaims> = object
> {
    origin?: string;
    url: string;
    urlParams: Record<string, string>;
    urlQuery: Record<string, unknown>;
    cookies: ReqCookies;

    /** Headers must be lowercase **/
    headers: IncomingHttpHeaders;
    routeConfig: KeycloakRouteConfig & KcRouteConfig;

    pluginDecorators: PluginDecorators;
    kccUserData?: UserData<KcClaims>;
    body?: Record<string, string>;
}

export interface UserDataResponse<Server extends SupportedServers> {
    userData: UserData,
    cookies?: CookieStore<Server>,
}

export interface State extends JWTPayload {
    authFlowNonce: string,
    sourceOrigin?: string | undefined,
    silentRequestType?: SilentLoginTypes,
    silentRequestToken?: string,
}

export interface ConnectorResponse<Server extends SupportedServers> {
    serveFileFullPath?: string,
    redirectUrl?: string,
    responseText?: string,
    responseHtml?: string,
    headers?: Record<string, string>,
    statusCode?: number,
    cookies?: CookieStore<Server>,
}

export interface CookieParams<Server extends SupportedServers> {
    name: string,
    value: string,
    options: CookieOptionsBase<Server>,
}

// export interface ClearCookieParams<Server extends SupportedServers> {
//     name: string,
//     options: CookieOptionsBase<Server>,
// }

export type CookieOptionsBase<Server extends SupportedServers> = Server extends SupportedServers.fastify ? CookieSerializeOptions : CookieOptions;

export enum SupportedServers {
    express = "express",
    fastify = "fastify"
}

export type KeycloakRouteConfigOrRoles = KeycloakRouteConfig | RoleRules | undefined | false;
export type KeycloakRouteConfig<Roles extends KeycloakRole = KeycloakRole> = RouteConfigRoles<Roles> & RouteConfigBase;

type RouteConfigRoles<Roles extends KeycloakRole> = {
    public: true;
} | {
    public?: false;
    roles?: RequiredRoles<Roles>;
}

type RouteConfigBase = {
    autoRedirect?: boolean;
    verifyAccessTokenWithServer?: boolean;
    verifyUserInfoWithServer?: boolean;
}

/**
 * Dev note - Unable to limit the number of properties declared when using a dynamic key in typescript
 * Even though typescript may not throw errors, the runtime script still may.
 */
export type KeycloakClient = string;
export type KeycloakRole = string;

export enum RoleLocations {
    REALM_ACCESS = "REALM_ACCESS",
    RESOURCE_ACCESS = "RESOURCE_ACCESS",
}

type RoleRule<
    Roles extends KeycloakRole = KeycloakRole
> = Roles | Roles[];

export type RoleRules<
    Roles extends KeycloakRole = KeycloakRole
> = RoleRule<Roles>[];

export type ClientRole<
    Clients extends KeycloakClient = KeycloakClient,
    Roles extends KeycloakRole = KeycloakRole
> = {
    [client in Clients]: RoleRules<Roles>;
};

export type RoleLocation<
    Roles extends KeycloakRole = KeycloakRole,
    Clients extends KeycloakClient = KeycloakClient
> = {
    [RoleLocations.REALM_ACCESS]?: RoleRules<Roles>;
    [RoleLocations.RESOURCE_ACCESS]?: ClientRole<Clients, Roles>;
};

export type CombinedRoleRules<
    Roles extends KeycloakRole = KeycloakRole,
    Clients extends KeycloakClient = KeycloakClient
> = RoleRules<Roles> | ClientRole<Clients, Roles> | RoleLocation<Roles>;

export type RequiredRoles<
    Roles extends KeycloakRole = KeycloakRole,
    Clients extends KeycloakClient = KeycloakClient
> = CombinedRoleRules<Roles, Clients> | Array<CombinedRoleRules<Roles, Clients>>;

export type KcAccessJWT = OidcIdToken & OidcStandardClaims & KcAccessClaims;

export type ExtendedRefreshTokenSet = {
    accessToken: KcAccessJWT,
    expiresAt: number,
    tokenSet: TokenEndpointResponse & Required<Pick<TokenEndpointResponse, 'refresh_token'>>
}

export type RefreshTokenSetResult = {
    extendedRefreshTokenSet: ExtendedRefreshTokenSet,
    shouldUpdateCookies: boolean,
}

type JWTRoles = {
    roles: string[],
};

interface KcAccessClaims {
    realm_access?: JWTRoles;
    resource_access?: {
        [client_id: string]: JWTRoles
    }
}

interface OidcIdToken extends JWTPayload {
    /**
     * JWT Authorized Time - Time when the End-User authentication occurred.
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#IDToken
     */
    auth_time?: number;

    /**
     * JWT Authentication Context Class Reference
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#IDToken
     */
    acr?: string;

    /**
     * JWT Authorized Party - The party to which the ID Token was issued
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#IDToken
     */
    azp?: string;

    /**
     * JWT Scope
     *
     * @see https://datatracker.ietf.org/doc/html/rfc6749#section-3.3
     */
    scope?: string;
}

interface OidcStandardClaims {
    /**
     * JWT Sub
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    sub?: string;

    /**
     * JWT name
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    name?: string;

    /**
     * JWT Given Name
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    given_name?: string;

    /**
     * JWT Family Name
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    family_name?: string;

    /**
     * JWT Middle Name
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    middle_name?: string;

    /**
     * JWT Nickname
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    nickname?: string;

    /**
     * JWT Preferred Username
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    preferred_username?: string;

    /**
     * JWT Profile URL
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    profile?: string;

    /**
     * JWT Picture URL
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    picture?: string;

    /**
     * JWT Website URL
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    website?: string;

    /**
     * JWT Email
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    email?: string;

    /**
     * JWT Email Verified
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    email_verified?: boolean;

    /**
     * JWT Gender
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    gender?: string;

    /**
     * JWT Birthdate
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    birthdate?: string;

    /**
     * JWT Zone Info
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    zoneinfo?: string;

    /**
     * JWT Locale
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    locale?: string;

    /**
     * JWT Phone Number
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    phone_number?: string;

    /**
     * JWT Phone Number Verified
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    phone_number_verified?: boolean;

    /**
     * JWT Address
     *
     * @type string - JSON
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    address?: string;

    /**
     * JWT Updated At Time
     *
     * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
     */
    updated_at?: number;
}

export type OidcDiscoveryConfig =
    Pick<KeycloakConnectorConfigBase, 'oidcClientMetadata' | 'pinoLogger' | 'DANGEROUS_disableJwtClientAuthentication'> & {
    connectorKeys: ConnectorKeys,
}

export type UserInfoResponseExtended<
    KcClaims extends JsonCompatibleClaims<KcClaims> = object
> = UserInfoResponse & KcAccessClaims & KcClaims;

export interface UserData<KcClaims extends JsonCompatibleClaims<KcClaims> = object> {
    isAuthenticated: boolean;
    isAuthorized: boolean;
    // roles: KeycloakRole[];
    accessToken?: KcAccessJWT;
    userInfo?: UserInfoResponseExtended<KcClaims> | undefined;
    userStatus?: UserStatus
}

export enum RoleConfigurationStyle {
    RoleRules = "RoleRules",
    ClientRole = "ClientRole",
    RoleLocation = "RoleLocation",
    CombinedRoleRulesArray = "CombinedRoleRulesArray",
}

export enum ClientSearch {
    REALM,
    RESOURCE_ACCESS,
}

export type ValueOf<T> = T[keyof T];
