import {sleep} from "./helpers/utils.js";
import {ClientMetadata, errors, generators, Issuer, IssuerMetadata} from "openid-client";
import type {
    ConnectorRequest,
    ConnectorResponse,
    CookieOptionsBase,
    CookieParams,
    KeycloakConnectorConfigBase,
    KeycloakConnectorConfigCustom,
    KeycloakConnectorInternalConfiguration,
    NullableProps,
    SupportedServers,
    UserData
} from "./types.js";
import {AzpOptions, RouteEnum, StateOptions} from "./types.js";
import type {AbstractAdapter, ConnectorCallback, RouteRegistrationOptions} from "./adapter/abstract-adapter.js";
import type {GenerateKeyPairResult, JWK, KeyLike} from "jose";
import * as jose from 'jose';
import {ConnectorErrorRedirect, ErrorHints, LoginError} from "./helpers/errors.js";
import {CookieNames, Cookies, CookiesToKeep} from "./helpers/cookies.js";
import {isDev} from "./helpers/utils.js";
import {RouteUrlDefaults, UserDataDefault} from "./helpers/defaults.js";
import type {JWTVerifyResult} from "jose/dist/types/types.js";
import {RoleHelper} from "./helpers/role-helper.js";
import RPError = errors.RPError;
import OPError = errors.OPError;

export class KeycloakConnector<Server extends SupportedServers> {

    private static readonly REQUIRED_ALGO = 'PS256';
    private readonly _config: KeycloakConnectorConfigBase;
    private readonly components: KeycloakConnectorInternalConfiguration<Server>;
    private readonly roleHelper: RoleHelper;
    private oidcConfigTimer: ReturnType<typeof setTimeout> | null = null;


    private readonly CookieOptions: CookieOptionsBase<Server> = {
        sameSite: "strict",
        httpOnly: true,
        secure: true,
        path: "/",
    }

    private readonly CookieOptionsLax: CookieOptionsBase<Server> = {
        ...this.CookieOptions,
        sameSite: "lax",
    }

    private constructor(
        config: KeycloakConnectorConfigBase,
        components: KeycloakConnectorInternalConfiguration<Server>,
        adapter: AbstractAdapter<Server>
    ) {
        // Store the config and components
        this._config = Object.freeze(config);
        this.components = components;

        const defaultResourceAccessKey = this._config.defaultResourceAccessKey ?? this.components.oidcClient.metadata.client_id;
        this.roleHelper = new RoleHelper(defaultResourceAccessKey, this._config.pinoLogger);

        // Configure updating the OP oidc configuration periodically
        if (this._config.refreshConfigSecs && this._config.refreshConfigSecs > 0) {
            this.oidcConfigTimer = setTimeout(this.updateOpenIdConfig.bind(this), this._config.refreshConfigSecs * 1000);
        }

        // Register the routes using the connector adapter
        this.registerRoutes(adapter);
    }

    private registerRoutes(adapter: AbstractAdapter<Server>): void {

        // todo: make these routes dynamic

        /**
         * Shows the client provided login page
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.LOGIN_PAGE),
            method: "GET",
            isPublic: true,
        }, this.handleLoginGet);

        /**
         * Handles the redirect to the OP
         */
        this.registerRoute(adapter,{
            url: this.getRoutePath(RouteEnum.LOGIN_POST),
            method: "POST",
            isPublic: true,
        }, this.handleLoginPost);

        /**
         * Handles the callback from the OP
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.CALLBACK),
            method: "GET",
            isPublic: true,
        }, this.handleCallback);

        /**
         * Serves the JWK set containing the client's public key
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.PUBLIC_KEYS),
            method: "GET",
            isPublic: true,
        }, this.handleClientJWKS);
    }

    private registerRoute(adapter: AbstractAdapter<Server>,
                          options: RouteRegistrationOptions,
                          handler: ConnectorCallback<Server>): void {
       adapter.registerRoute(options, this.handleWrapper(handler));
    }

    private handleWrapper(handler: ConnectorCallback<Server>): ConnectorCallback<Server> {
        return (async (connectorReq: ConnectorRequest): Promise<ConnectorResponse<Server>> => {
            try {
                return await handler(connectorReq);
            } catch (e) {

                // Rethrow all other errors and LoginErrors that do not redirect
                if (!(e instanceof LoginError) || !e.redirect) throw e;

                return new ConnectorErrorRedirect(this.getRoutePath(RouteEnum.LOGIN_PAGE), e.hint);
            }
        });
    }

    private handleLoginGet = async (): Promise<ConnectorResponse<Server>> => ({
        serveFile: "login-start.html",
    });

    private handleLoginPost = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Ensure the request comes from our origin
        if (req.origin !== this._config.serverOrigin) {
            // Log this error (possibly detect attacks)
            this._config.pinoLogger?.warn(`Login POST request came from different origin. Expected: ${this._config.serverOrigin}, Got: ${req.origin}`);

            throw new LoginError(ErrorHints.CODE_400);
        }

        const cv = generators.codeVerifier();
        const authorizationUrl = this.components.oidcClient.authorizationUrl({
            code_challenge_method: "S256",
            code_challenge: generators.codeChallenge(cv),
            redirect_uri: this.components.oidcClient.metadata.redirect_uris?.[0] ?? "",
            response_mode: "jwt",
            scope: "openid",
        });

        // Collect the cookies we would like the server to send back
        const cookies: CookieParams<Server>[] = [];

        // Build the base cookie options used for the initial login portion
        const baseCookieOptions: CookieOptionsBase<Server> = {
            sameSite: "lax",
            httpOnly: true,
            secure: true,
            expires: new Date(+new Date() + this._config.loginCookieTimeout),
            path: "/",
        }

        // Build the code verifier cookie
        cookies.push({
            name: Cookies.CODE_VERIFIER,
            value: cv,
            options: {
                ...baseCookieOptions
            }
        });

        return {
            redirectUrl: authorizationUrl,
            statusCode: 303,
            cookies: cookies,
        }
    };

    private handleCallback = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Ingest required cookies
        // Note: Cookie code/structure left for future expansion
        type CallbackRequiredCookies = {
            codeVerifier: string;
            // redirectUrl: string;
        }

        let inputCookiesRaw: NullableProps<CallbackRequiredCookies>;

        try {
            // Grab the input cookies
            inputCookiesRaw = {
                codeVerifier: req.cookies[Cookies.CODE_VERIFIER],
                // redirectUrl: atob(req.cookies?.[Cookies.REDIRECT_URI_64]),
            }
        } catch (e) {

            // Log the bad request (to possibly detect attacks)
            this._config.pinoLogger?.warn(e, "Invalid cookies from browser during login");

            // Redirect the user back to the login page
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Check for any missing cookies
        if (!Object.values(inputCookiesRaw).every(cookie => cookie !== undefined && cookie !== null)) {
            // Log the bad request
            this._config.pinoLogger?.warn("Missing cookies from browser during login");

            // Redirect the user back to the login page
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Redeclare the cookies for typescript
        const inputCookies: CallbackRequiredCookies = <CallbackRequiredCookies> inputCookiesRaw;

        try {
            const tokenSet = await this.components.oidcClient.callback(
                this.components.oidcClient.metadata.redirect_uris?.[0] ?? undefined,
                this.components.oidcClient.callbackParams(req.url),
                {
                    code_verifier: inputCookies.codeVerifier,
                    jarm: true,
                    response_type: "code",
                }
            );


            // Check the state configuration
            //todo: add support for stateful

            // todo: move this to its own method
            // Handle stateless configuration

            // Ensure certain properties exist (and make typescript happy)
            if (!tokenSet.refresh_token ||
                !tokenSet.access_token  ||
                !tokenSet.id_token      ||
                !tokenSet.expires_at
            ) {
                // noinspection ExceptionCaughtLocallyJS
                throw new OPError({error: "Missing required properties from OP"});
            }

            // Decode the refresh token to grab the expiration date
            const refreshTokenExpiration = jose.decodeJwt(tokenSet.refresh_token).exp ?? tokenSet.expires_at;

            // Collect the cookies we would like the server to send back
            const cookies: CookieParams<Server>[] = [];

            // Store the access token
            cookies.push({
                name: Cookies.ACCESS_TOKEN,
                value: tokenSet.access_token,
                options: {
                    ...this.CookieOptions,
                    expires: new Date(tokenSet.expires_at * 1000),
                }
            });

            // Store the refresh token
            cookies.push({
                name: Cookies.REFRESH_TOKEN,
                value: tokenSet.refresh_token,
                options: {
                    ...this.CookieOptions,
                    expires: new Date(refreshTokenExpiration * 1000),
                }
            });

            // Grab the cookies to remove
            cookies.push(...this.removeExcessCookies(req.cookies));

            return {
                statusCode: 303,
                cookies: cookies,
                ...this._config.serverOrigin && {redirectUrl: this._config.serverOrigin}, //todo: redirect as needed for user experience
            }

        } catch (e) {

            if (e instanceof RPError) {
                // Check for an expired JWT
                if (e.message.includes("JWT expired")) {
                    // Hint to the login page the user took too long
                    throw new LoginError(ErrorHints.JWT_EXPIRED);
                } else if (e.message.includes("request timed out after")) {

                    // Log the issue as the OP may not be able to handle the requests or
                    // the RP (this server) is not able to connect to the OP
                    this._config.pinoLogger?.error(e, `Timed out while connecting to the OP. It is possible the OP is still trying to fetch this server's public key and has not yet timed out from that response before we did here.`);

                } else {
                    // Log the issue as a possibility to detect attacks
                    this._config.pinoLogger?.warn(e, `Failed to complete login, RP error`);

                    // Default 400 error
                    throw new LoginError(ErrorHints.CODE_400);
                }
            } else if (e instanceof OPError) {
                // Log the issue
                this._config.pinoLogger?.error(e, `Unexpected response from OP`);
            } else {
                // Log the issue
                this._config.pinoLogger?.error(e, `Unexpected error during login`);
            }

            throw new LoginError(ErrorHints.CODE_500);
        }
    };

    private handleClientJWKS = async (): Promise<ConnectorResponse<Server>> => {
        const keys = {
            "keys": [this.components.connectorKeys.publicJwk]
        };

        return {
            statusCode: 200,
            responseText: JSON.stringify(keys),
        };
    };
    private removeExcessCookies<Server extends SupportedServers>(reqCookies: unknown): CookieParams<Server>[] {
        const cookies: CookieParams<Server>[] = [];

        // Check if input is truthy
        if (!reqCookies) return cookies;

        // Scan through request cookies to find ones to remove
        for (const cookieName of Object.keys(reqCookies)) {
            if (CookieNames.includes(cookieName) && !CookiesToKeep.includes(cookieName)) {
                cookies.push({
                    name: cookieName,
                    value: "",
                    options: {
                        ...this.CookieOptionsLax,
                        expires: new Date(0),
                    }
                })
            }
        }

        return cookies;
    }

    private validateJwt = async (jwt: string): Promise<JWTVerifyResult> => {

        // Verify the token
        const verifyResult = await jose.jwtVerify(jwt, this.components.remoteJWKS, {
            algorithms: [KeycloakConnector.REQUIRED_ALGO],
            issuer: this.components.oidcIssuer.metadata.issuer,
            ...(this._config.jwtClaims?.audience && {audience: this._config.jwtClaims?.audience}),
        });

        // Validate azp declaration
        const azpConfig = this._config.jwtClaims?.azp;
        const jwtAzp = verifyResult.payload['azp'];
        if (azpConfig !== AzpOptions.IGNORE &&
            !(jwtAzp === undefined && azpConfig === AzpOptions.MATCH_CLIENT_ID_IF_PRESENT)
        ) {
            if (typeof azpConfig === 'string') {
                if (azpConfig !== jwtAzp) {
                    throw new Error(`Invalid AZP claim, expected ${azpConfig}`);
                }
            } else if (jwtAzp !== this.components.oidcClient.metadata.client_id) {
                throw new Error(`Invalid AZP claim, expected ${this.components.oidcClient.metadata.client_id}`);
            }
        }

        return verifyResult;
    }

    public getUserData = async (req: ConnectorRequest): Promise<UserData> => {
        // Start with a user who has no data, no authentication
        const userData: UserData = structuredClone(UserDataDefault);

        try {

            // Check the state configuration
            //todo: add support for stateful configurations

            // Handle stateless configuration
            const accessJwt = req.cookies?.[Cookies.ACCESS_TOKEN];

            // No access token, return the default user data
            if (accessJwt === undefined) return userData;

            // Validate and save the access token payload
            ({payload: userData.accessToken} = await this.validateJwt(accessJwt));

        } catch (e) {

            // Log if only to detect attacks
            this._config.pinoLogger?.warn(e, 'Could not obtain user data from request');

            return userData;

        }

        //todo: test if the validate function checks for old authentications

        userData.isAuthenticated = true;

        if (req.routeConfig.public || req.routeConfig.roles === undefined) {
            userData.isAuthorized = true;
        } else if (req.routeConfig.roles) {
            userData.isAuthorized = this.roleHelper.userHasRoles(req.routeConfig.roles, userData.accessToken);
        } else {
            this._config.pinoLogger?.error("Invalid route configuration, must specify roles if route is not public.");
            throw new Error('Invalid route configuration, must specify roles if route is not public.');
        }

        return userData;
    }

    public buildRouteProtectionResponse = async (req: ConnectorRequest, userData: UserData): Promise<ConnectorResponse<Server> | undefined> => {

        // Return immediately if the route is public or the user is authorized
        if (req.routeConfig.public || userData.isAuthorized) return;

        // Check if unauthenticated
        if (!userData.isAuthenticated) {

            //todo: auto update their access token?? probably not here. move to the user data function

            // Auto redirect to login page
            if (req.routeConfig.autoRedirect !== false && req.headers['sec-fetch-mode'] === 'navigate') {
                return new ConnectorErrorRedirect(this.getRoutePath(RouteEnum.LOGIN_PAGE), ErrorHints.UNAUTHENTICATED);
            }

            //todo: make customizable
            return {
                statusCode: 401,
                responseText: 'unauthenticated', //todo: customizable
            }
        }

        // Member is not authorized
        return {
            statusCode: 403,
            responseText: 'unauthorized',
        }
    }
    private async updateOpenIdConfig() {

        // Attempt to grab a new configuration
        const newOidcConfig = await KeycloakConnector.fetchOpenIdConfig(this.components.oidcDiscoveryUrl, this._config);

        // Check for a configuration and check it is an update to the existing one
        if (newOidcConfig && JSON.stringify(newOidcConfig) !== JSON.stringify(this.components.oidcConfig)) {
            // Store the configuration
            this.components.oidcConfig = newOidcConfig;

            // Handle configuration change
            ({oidcIssuer: this.components.oidcIssuer, oidcClient: this.components.oidcClient} = await KeycloakConnector.createOidcClients(newOidcConfig, this._config.oidcClientMetadata, this.components.connectorKeys.privateJwk));
        }

        // Reset the timer
        this.oidcConfigTimer?.refresh();
    }

    static async init<Server extends SupportedServers>(adapter: AbstractAdapter<Server>, customConfig: KeycloakConnectorConfigCustom) {

        // Sanity check configuration
        if (!isDev() && customConfig.serverOrigin === undefined) throw new Error(`Must specify server origin for non-dev builds`);

        // Placeholder to help ID missing configuration information (prevent a "magic number" situation)
        const EMPTY_STRING = "";

        const config: KeycloakConnectorConfigBase = {
            // Defaults
            refreshConfigSecs: 1,
            loginCookieTimeout: 35 * 60 * 1000, // Default: 35 minutes
            stateType: StateOptions.STATELESS,

            // Consumer provided configuration
            ...customConfig,

            oidcClientMetadata: {
                //ref: https://github.com/panva/node-openid-client/blob/main/docs/README.md#new-clientmetadata-jwks-options
                //ref: https://openid.net/specs/openid-connect-registration-1_0.html

                client_id: process.env['KC_CLIENT_ID'] ?? EMPTY_STRING,
                redirect_uris: [
                    KeycloakConnector.getRouteUri(RouteEnum.CALLBACK, customConfig),
                ],
                post_logout_redirect_uris: [
                    KeycloakConnector.getRouteUri(RouteEnum.LOGIN_PAGE, customConfig),
                ],

                // Consumer provided metadata
                ...customConfig.oidcClientMetadata,

                // Force a code response
                response_types: ['code'],

                // Force certain auth method and signing algorithms based on FAPI
                token_endpoint_auth_method: 'private_key_jwt',
                tls_client_certificate_bound_access_tokens: false,
                introspection_endpoint_auth_method: 'private_key_jwt',
                revocation_endpoint_auth_method: 'private_key_jwt',
                token_endpoint_auth_signing_alg: KeycloakConnector.REQUIRED_ALGO,
                request_object_signing_alg: KeycloakConnector.REQUIRED_ALGO,
                introspection_endpoint_auth_signing_alg: KeycloakConnector.REQUIRED_ALGO,
                revocation_endpoint_auth_signing_alg: KeycloakConnector.REQUIRED_ALGO,
            }
        };

        // Check for invalid client metadata
        if (config.oidcClientMetadata.client_id === EMPTY_STRING) throw new Error(`Client ID not specified or found`);
        if (config.oidcClientMetadata.redirect_uris === undefined || config.oidcClientMetadata.redirect_uris.length === 0)  throw new Error(`No login redirect URIs specified`);
        if (config.oidcClientMetadata.post_logout_redirect_uris === undefined || config.oidcClientMetadata.post_logout_redirect_uris.length === 0)  throw new Error(`No post logout redirect URIs specified`);

        // Manipulate pino logger to embed a _prefix into each message
        if (config.pinoLogger) config.pinoLogger = config.pinoLogger.child({"Source": "KeycloakConnector"});

        // Build the oidc discovery url (ref: https://issues.redhat.com/browse/KEYCLOAK-571)
        const authPath = (config.keycloakVersionBelow18) ? "/auth" : "";
        const oidcDiscoveryUrl = config.oidcDiscoveryUrlOverride ?? `${config.authServerUrl}${authPath}/realms/${config.realm}/.well-known/openid-configuration`;

        // Grab the oidc configuration from the OP
        const openIdConfig = await KeycloakConnector.fetchInitialOpenIdConfig(oidcDiscoveryUrl, config);

        // Grab the privateJwk
        //todo: Need to redesign this to handle server scaling (i.e. multiple instances of the server... they will have different keys)
        const keyPair = await KeycloakConnector.generateKeyPair();

        const extraProps = {
            use: 'sig',
            alg: KeycloakConnector.REQUIRED_ALGO,
            kid: 'kcc-signing-' + Date.now(),
        }

        const publicJwk = {
            ...extraProps,
            ...await jose.exportJWK(keyPair.publicKey),
        };

        const privateJwk = {
            ...extraProps,
            ...await jose.exportJWK(keyPair.privateKey),
        };

        // Grab the oidc clients
        const oidcClients = await KeycloakConnector.createOidcClients(openIdConfig, config.oidcClientMetadata, privateJwk);

        // Ensure we have a JWKS uri
        if (oidcClients.oidcIssuer.metadata.jwks_uri === undefined) {
            throw new Error('Authorization server provided no JWKS_URI, cannot find public keys to verify tokens against');
        }

        // Store the OP JWK set
        const remoteJWKS = jose.createRemoteJWKSet(new URL(oidcClients.oidcIssuer.metadata.jwks_uri));

        const components: KeycloakConnectorInternalConfiguration<Server> = {
            // server: server,
            // adapter: serverAdapter,
            oidcDiscoveryUrl: oidcDiscoveryUrl,
            oidcConfig: openIdConfig,
            connectorKeys: {
                ...keyPair,
                publicJwk: publicJwk,
                privateJwk: privateJwk,
            },
            ...oidcClients,
            remoteJWKS: remoteJWKS,
        }

        // Return the new connector
        return new this<Server>(config, components, adapter);
    }

    private static async generateKeyPair(): Promise<GenerateKeyPairResult<KeyLike>> {
        return await jose.generateKeyPair(KeycloakConnector.REQUIRED_ALGO);
    }

    private static async createOidcClients(newOidcConfig: IssuerMetadata, oidcClientMetadata: ClientMetadata, privateJwk: JWK) {

        // Initialize Issuer with the new config
        const oidcIssuer = new Issuer(newOidcConfig);

        // Initialize the new Client
        const oidcClient = new oidcIssuer.FAPI1Client(oidcClientMetadata, {keys: [privateJwk]});

        return {
            oidcIssuer: oidcIssuer,
            oidcClient: oidcClient
        };
    }

    private static async fetchInitialOpenIdConfig(oidcDiscoveryUrl: string, config: KeycloakConnectorConfigBase): Promise<IssuerMetadata> {

        const MAX_ATTEMPTS = 15;
        let attempts = 0;
        let backoffSecs = 1;

        do {
            // Fetch the configuration
            const newOpenIdConfig = await KeycloakConnector.fetchOpenIdConfig(oidcDiscoveryUrl, config);

            // Check for a proper config
            if (newOpenIdConfig) return newOpenIdConfig;

            // Increase the backoff to a max of 60 seconds
            backoffSecs = Math.ceil(Math.min(backoffSecs * 1.5, 60));

            // Log the error
            config.pinoLogger?.error(`Start up error, failed to fetch auth server configuration ...retrying in ${backoffSecs} seconds`);

            // Hang here since we are on startup
            await sleep(backoffSecs * 1000);

        } while(++attempts < MAX_ATTEMPTS);

        throw new Error(`Failed to fetch OIDC config from remote server after ${MAX_ATTEMPTS} tries. Cannot start.`);
    }

    private static async fetchOpenIdConfig(oidcDiscoveryUrl: string, config: KeycloakConnectorConfigBase): Promise<IssuerMetadata | null> {

        try {
            config.pinoLogger?.debug(`Fetching oidc configuration from ${oidcDiscoveryUrl}`);

            // Fetch latest openid-config data
            const result = await fetch(oidcDiscoveryUrl, {signal: AbortSignal.timeout(5000)});

            // Check for an incorrect status code
            if (result.status !== 200) {
                config.pinoLogger?.warn(`Could not fetch openid-configuration, unexpected response from auth server: ${result.status}`);
                return null;
            }

            // Grab the json value
            return Object.freeze(await result.json()) as IssuerMetadata;

        } catch (e) {
            // Log the error
            config.pinoLogger?.warn(e, `Failed to fetch latest openid-config data`);
            return null;
        }
    }

    private getRoutePath = (route: RouteEnum): string => {
        return KeycloakConnector.getRoutePath(route, this._config);
    }
    static getRoutePath(route: RouteEnum, config: KeycloakConnectorConfigCustom | KeycloakConnectorConfigBase) {
        const prefix = config.routePaths?._prefix ?? RouteUrlDefaults._prefix;

        switch(route) {
            case RouteEnum.LOGIN_PAGE:
                return `${prefix}${config.routePaths?.loginPage ?? RouteUrlDefaults.loginPage}`;
            case RouteEnum.LOGIN_POST:
                return `${prefix}${config.routePaths?.loginPost ?? RouteUrlDefaults.loginPost}`;
            case RouteEnum.CALLBACK:
                return `${prefix}${config.routePaths?.callback ?? RouteUrlDefaults.callback}`;
            case RouteEnum.PUBLIC_KEYS:
                return `${prefix}${config.routePaths?.publicKeys ?? RouteUrlDefaults.publicKeys}`;
        }
    }

    private getRouteUri = (route: RouteEnum): string => {
        return KeycloakConnector.getRouteUri(route, this._config);
    }

    static getRouteUri(route: RouteEnum, config: KeycloakConnectorConfigCustom | KeycloakConnectorConfigBase) {
        return config.serverOrigin + KeycloakConnector.getRoutePath(route, config);
    }
    get oidcConfig(): IssuerMetadata | null {
        return this.components.oidcConfig;
    }
    get config(): KeycloakConnectorConfigBase {
        return this._config;
    }
}