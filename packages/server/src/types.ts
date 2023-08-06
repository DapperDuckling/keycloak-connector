import type {Client, ClientMetadata, Issuer, IssuerMetadata} from "openid-client";
//todo: remove these individual packages
import type {CookieSerializeOptions} from "@fastify/cookie";
import type {CookieOptions} from "express-serve-static-core";
import type {GenerateKeyPairResult, JWK} from "jose";
import type {Logger} from "pino";
import type {KeyLike} from "jose";
import type { IncomingHttpHeaders } from "node:http";
import type {JWTPayload} from "jose/dist/types/types.js";

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

//todo: remove generic if not needed
// @ts-ignore
export interface KeycloakConnectorInternalConfiguration<Server extends SupportedServers> {
    // server: SupportedServers;
    // adapter: AbstractAdapter<Server>;
    oidcDiscoveryUrl: string;
    oidcConfig: IssuerMetadata;
    oidcIssuer: Issuer;
    oidcClient: Client;
    connectorKeys: ConnectorKeys;
    remoteJWKS: () => Promise<KeyLike>;

}

export type ConnectorKeys = GenerateKeyPairResult & {
    publicJwk: JWK;
    privateJwk: JWK;
}

export type KeycloakConnectorConfigCustom =
    Omit<Partial<KeycloakConnectorConfigBase>, 'oidcClientMetadata'> &
    Pick<KeycloakConnectorConfigBase, 'authServerUrl' | 'realm' | 'serverOrigin'> & {
    oidcClientMetadata?: Partial<ClientMetadata>,
}

export enum StateOptions {
    STATELESS = 0,
    MIXED = 1,
    STATEFUL = 2,
}

export interface KeycloakConnectorConfigBase {
    /** The RP server origin */
    serverOrigin: string;

    /** The OP server url */
    authServerUrl: string;

    /** The OP realm to use */
    realm: string;

    /** The RP client data */
    oidcClientMetadata: ClientMetadata;

    /** TLDR; KC versions < 18 have the /auth _prefix in the url */
    keycloakVersionBelow18?: boolean;

    /** How often should we ping the OP for an updated oidc configuration */
    refreshConfigSecs?: number;

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
    loginCookieTimeout: number;

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

    /** Optional claims required when verifying user-provided JWTs */
    jwtClaims?: {
        /** Require the user-provided JWT to be intended for a particular audience */
        audience?: string;

        /** Ensures the party to which the JWT was issued matches provided value. By default, azp must match the current `client_id` */
        azp?: string | AzpOptions;
    }
}

export enum AzpOptions {
    MUST_MATCH_CLIENT_ID = 0,
    MATCH_CLIENT_ID_IF_PRESENT = 1,
    IGNORE = 2,
}

export type CustomRouteUrl = {
    _prefix?: string;
    loginPage?: string;
    loginPost?: string;
    callback?: string;
    publicKeys?: string;
    loginStatus?: string;
}

export enum RouteEnum {
    LOGIN_PAGE = 0,
    LOGIN_POST = 1,
    CALLBACK = 2,
    PUBLIC_KEYS = 3,
    LOGIN_STATUS = 4,
}

export type Cookies = { [cookieName: string]: string | undefined };

export interface ConnectorRequest {
    origin?: string;
    url: string;
    cookies: Cookies;

    /** Headers must be lowercase **/
    headers: IncomingHttpHeaders;
    routeConfig: KeycloakRouteConfig;

    keycloak?: UserData;
}

export interface ConnectorResponse<Server extends SupportedServers> {
    serveFile?: string,
    redirectUrl?: string,
    responseText?: string,
    statusCode?: number,
    cookies?: CookieParams<Server>[],
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

export type KeycloakRouteConfigOrRoles = KeycloakRouteConfig | RoleRules | undefined;
export type KeycloakRouteConfig<Roles extends KeycloakRole = KeycloakRole> = RouteConfigRoles<Roles> & RouteConfigBase;

type RouteConfigRoles<Roles extends KeycloakRole> = {
    public: true;
} | {
    public?: false;
    roles?: RequiredRoles<Roles>;
}

type RouteConfigBase = {
    autoRedirect?: boolean;
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

export interface UserData {
    isAuthenticated: boolean;
    isAuthorized: boolean;
    roles: KeycloakRole[];
    accessToken?: KcAccessJWT;
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