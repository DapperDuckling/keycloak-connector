import {epoch, isDev, sleep} from "./helpers/utils.js";
import {type ClientMetadata, errors, generators, Issuer, type IssuerMetadata} from "openid-client";
import type {
    ConnectorRequest,
    ConnectorResponse,
    CookieOptionsBase,
    CookieParams,
    KeycloakConnectorConfigBase,
    KeycloakConnectorConfigCustom,
    KeycloakConnectorInternalConfiguration,
    SupportedServers,
    UserData
} from "./types.js";
import {JwtTokenTypes, RouteEnum, StateOptions} from "./types.js";
import type {AbstractAdapter, ConnectorCallback, RouteRegistrationOptions} from "./adapter/abstract-adapter.js";
import type {JWK} from "jose";
import * as jose from 'jose';
import {ConnectorErrorRedirect, ErrorHints, LoginError} from "./helpers/errors.js";
import {CookieNames, Cookies, CookiesToKeep} from "./helpers/cookies.js";
import {RouteUrlDefaults, UserDataDefault} from "./helpers/defaults.js";
import type {JWTVerifyResult} from "jose/dist/types/types.js";
import {RoleHelper} from "./helpers/role-helper.js";
import {standaloneKeyProvider} from "./crypto/standalone-key-provider.js";
import type {KeyProviderConfig} from "./crypto/abstract-key-provider.js";
import {webcrypto} from "crypto";
import RPError = errors.RPError;
import OPError = errors.OPError;

export class KeycloakConnector<Server extends SupportedServers> {

    public static readonly REQUIRED_ALGO = 'PS256'; // FAPI required algo, see: https://openid.net/specs/openid-financial-api-part-2-1_0.html
    private readonly _config: KeycloakConnectorConfigBase;
    private readonly components: KeycloakConnectorInternalConfiguration;
    private readonly roleHelper: RoleHelper;
    private oidcConfigTimer: ReturnType<typeof setTimeout> | null = null;
    private updateOidcConfig: Promise<boolean> | null = null;
    private updateOidcConfigPending: Promise<boolean> | null = null;

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
        components: KeycloakConnectorInternalConfiguration,
        adapter: AbstractAdapter<Server>
    ) {
        // Store the config and components
        this._config = Object.freeze(config);
        this.components = components;

        this.roleHelper = new RoleHelper({
            defaultResourceAccessKey : this._config.defaultResourceAccessKey ?? this.components.oidcClient.metadata.client_id,
            pinoLogger : this._config.pinoLogger,
            caseSensitiveRoleCheck: this._config.caseSensitiveRoleCheck,
        });

        // Configure updating the OP oidc configuration periodically
        if (this._config.refreshConfigMins && this._config.refreshConfigMins > 0) {
            // Create a timeout
            this.oidcConfigTimer = setTimeout(this.updateOpenIdConfig.bind(this), this._config.refreshConfigMins * 60 * 1000);
        }

        // Register the routes using the connector adapter
        this.registerRoutes(adapter);

        // Register the on key update listener
        this.components.keyProvider.registerCallbacks(
            this.updateOpenIdConfig,
            this.updateOidcServer
        );
    }

    private registerRoutes(adapter: AbstractAdapter<Server>): void {

        /**
         * Shows the client provided login page
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.LOGIN_PAGE),
            method: "GET",
            isPublic: true,
        }, this.handleLoginGet);

        /**
         * Handles the redirect to the OP for user login
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
         * Shows the client provided logout page
         */
        this.registerRoute(adapter,{
            url: this.getRoutePath(RouteEnum.LOGOUT_PAGE),
            method: "GET",
            isPublic: true,
        }, this.handleLogoutGet);

        /**
         * Handles the redirect to the OP for user logout
         */
        this.registerRoute(adapter,{
            url: this.getRoutePath(RouteEnum.LOGOUT_POST),
            method: "POST",
            isPublic: true,
        }, this.handleLogoutPost);


        /**
         * Handles the logout redirect from the OP
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.LOGOUT_CALLBACK),
            method: "GET",
            isPublic: true,
        }, this.handleLogoutCallback);

        /**
         * Serves the JWK set containing the client's public key
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.PUBLIC_KEYS),
            method: "GET",
            isPublic: true,
        }, this.handleClientJWKS);

        /**
         * Handles any back channel logout messages from keycloak
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.ADMIN_URL),
            method: "POST",
            isPublic: true,
        }, this.handleAdminMessages);

        /**
         * Handles any back channel logout messages from keycloak
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.BACK_CHANNEL_LOGOUT),
            method: "POST",
            isPublic: true,
        }, this.handleBackChannelLogout);

        /**
         * Provides a quick endpoint for client side scripts to check status of authentication
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.LOGIN_STATUS),
            method: "GET",
            isPublic: true,
        }, this.handleLoginStatus);
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
        this.validateSameOriginOrThrow(req);

        // Generate random values
        const cv = generators.codeVerifier();

        // The login flow nonce is a custom parameter to help the user experience in case they attempt to sign in across multiple pages at the same time
        // Once KC returns a valid login, the nonce will be used to grab the cookies unique to this login attempt
        const authFlowNonce = generators.nonce();

        // Build the redirect uri
        const redirectUri = this.buildRedirectUriOrThrow(authFlowNonce);

        const authorizationUrl = this.components.oidcClient.authorizationUrl({
            code_challenge_method: "S256",
            code_challenge: generators.codeChallenge(cv),
            redirect_uri: redirectUri,
            response_mode: "jwt",
            scope: "openid",
        });

        // Collect the cookies we would like the server to send back
        const cookies: CookieParams<Server>[] = [];

        // Build the code verifier cookie
        cookies.push({
            name: `${Cookies.CODE_VERIFIER}-${authFlowNonce}`,
            value: cv,
            options: {
                ...this.CookieOptionsLax,
                expires: new Date(+new Date() + this._config.authCookieTimeout),
            }
        });

        // Add the redirect cookie
        const redirectCookie = this.buildRedirectCookie({
            req: req,
            authFlowNonce: authFlowNonce,
        });

        cookies.push(...redirectCookie);

        return {
            redirectUrl: authorizationUrl,
            statusCode: 303,
            cookies: cookies,
        }
    }

    private validateRedirectUriOrThrow = (rawRedirectUri: string | null): boolean => {

        // Check for a null redirect uri (i.e. no redirect uri)
        if (rawRedirectUri === null) return true;

        let redirectUriOrigin;

        try {
            // Attempt to extract the origin from the redirect url
            redirectUriOrigin = (new URL(rawRedirectUri)).origin;
        } catch (e) {}

        // Check for mismatched origin
        if (redirectUriOrigin !== this._config.serverOrigin) {
            // Log the potentially dangerous error
            this._config.pinoLogger?.warn({
                redirectUrlOrigin: redirectUriOrigin,
                serverOrigin: this._config.serverOrigin,
            }, `Login redirect url origin does not match server origin!`);
            throw new LoginError(ErrorHints.CODE_400);
        }

        return true;
    }

    private buildRedirectCookie = (opts: {
        req: ConnectorRequest,
        authFlowNonce: string,
        isLogout?: boolean
    }): CookieParams<Server>[] => {

        // Grab the individual properties
        const {req, authFlowNonce, isLogout} = opts;

        // Handle the post login redirect uri
        const inputUrlObj = new URL(req.url, req.origin);
        const rawPostAuthRedirectUri = inputUrlObj.searchParams.get('post_auth_redirect_uri');
        let rawPostAuthRedirectUriObj: URL | null = null;

        try {
            rawPostAuthRedirectUriObj = new URL(rawPostAuthRedirectUri ?? "");
        } catch (e) {} // Invalid redirect uri, ignore

        // todo: FUTURE FEATURE -- Add option to filter auth redirect uri

        // Build the auth redirect uri cookie if the redirect uri is from the same origin
        if (!rawPostAuthRedirectUriObj || rawPostAuthRedirectUriObj.origin !== this._config.serverOrigin) return [];

        // Check if the post auth redirect is the same as the start pages
        if ((!isLogout && rawPostAuthRedirectUriObj.pathname === this.getRoutePath(RouteEnum.LOGIN_PAGE)) ||
            (isLogout && rawPostAuthRedirectUriObj.pathname === this.getRoutePath(RouteEnum.LOGOUT_PAGE))) return [];

        const postAuthRedirectUri = rawPostAuthRedirectUriObj.toString();
        const baseCookieName = (!isLogout) ? Cookies.REDIRECT_URI_B64 : Cookies.LOGOUT_REDIRECT_URI_B64;

        return [{
            name: `${baseCookieName}-${authFlowNonce}`,
            value: Buffer.from(postAuthRedirectUri).toString('base64'),
            options: {
                ...this.CookieOptionsLax,
                expires: new Date(+new Date() + this._config.authCookieTimeout),
            }
        }];
    }

    private buildRedirectUriOrThrow = (authFlowNonce: string, isLogout = false): string => {

        // Grab the base redirect uri
        const redirectUriBase = (!isLogout) ?
            this.components.oidcClient.metadata.redirect_uris?.[0] :
            this.components.oidcClient.metadata.post_logout_redirect_uris?.[0];

        // Ensure we found a URI to use
        if (redirectUriBase === undefined) {
            this._config.pinoLogger?.error(`Connector not properly setup, need valid redirect uri.`);
            throw new LoginError(ErrorHints.CODE_500);
        }

        // Convert the base uri to a URL object
        const redirectUriObj = new URL(redirectUriBase);

        // Add the login flow nonce to redirect the uri
        redirectUriObj.searchParams.append("auth_flow_nonce", authFlowNonce);

        return redirectUriObj.toString();
    }

    private validateSameOriginOrThrow = (req: ConnectorRequest) => {
        if (req.origin !== this._config.serverOrigin) {
            // Log this error (possibly detect attacks)
            this._config.pinoLogger?.warn(`POST request came from different origin. Expected: ${this._config.serverOrigin}, Got: ${req.origin}`);

            throw new LoginError(ErrorHints.CODE_400);
        }
    }

    private getAuthFlowNonce = (req: ConnectorRequest): string|null => {
        // Check for login flow nonce
        // (`base` added since browsers are not required to send an origin for all requests. It has no other function than to allow the built-in `URL` class to work in-line)
        return (new URL(req.url, "https://localhost")).searchParams.get('auth_flow_nonce');
    }

    private handleCallback = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Grab the auth flow nonce
        const authFlowNonce = this.getAuthFlowNonce(req);

        // Check for missing auth flow nonce
        if (authFlowNonce === null) {
            // Log the bad request
            this._config.pinoLogger?.warn(req.url, "Missing login flow nonce parameter during login attempt");

            // Redirect the user back to the login page
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Ingest required cookies
        let inputCookies: {
            codeVerifier: string | undefined;
            redirectUriRaw: string | undefined;
        };

        try {
            const redirectUri64 = req.cookies?.[`${Cookies.REDIRECT_URI_B64}-${authFlowNonce}`];
            
            // Grab the input cookies
            inputCookies = {
                codeVerifier: req.cookies[`${Cookies.CODE_VERIFIER}-${authFlowNonce}`],
                redirectUriRaw: (!!redirectUri64) ? Buffer.from(redirectUri64, 'base64').toString() : undefined,
            }
        } catch (e) {

            // Log the bad request
            this._config.pinoLogger?.warn(e, "Invalid cookie(s) from browser during login attempt");

            // Redirect the user back to the login page
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Build the redirect uri
        const redirectUri = this.buildRedirectUriOrThrow(authFlowNonce);

        // Check for a code verifier
        if (inputCookies.codeVerifier === undefined) {
            // Log the bad request (to possibly detect attacks)
            this._config.pinoLogger?.warn("Missing code verifier during login attempt");

            // Redirect the user back to the login page
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Build the post login redirect uri
        let postAuthRedirectUri = inputCookies.redirectUriRaw ?? null;

        // Validate the redirect uri
        this.validateRedirectUriOrThrow(postAuthRedirectUri);

        try {
            const tokenSet = await this.components.oidcClient.callback(
                redirectUri,
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

            // Store refresh token expiration date in a javascript accessible location
            cookies.push({
                name: Cookies.REFRESH_TOKEN_EXPIRATION,
                value: refreshTokenExpiration.toString(),
                options: {
                    ...this.CookieOptions,
                    httpOnly: false,
                    expires: new Date(refreshTokenExpiration * 1000),
                }
            });

            // Store the id token
            cookies.push({
                name: Cookies.ID_TOKEN,
                value: tokenSet.id_token,
                options: {
                    ...this.CookieOptions,
                    expires: new Date(refreshTokenExpiration * 1000), // Intentionally use refresh token expiration
                }
            });

            // Grab the cookies to remove
            cookies.push(...this.removeAuthFlowCookies(req.cookies, authFlowNonce));

            return {
                statusCode: 303,
                cookies: cookies,
                redirectUrl: postAuthRedirectUri ?? this._config.serverOrigin,
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
    }

    private handleLogoutGet = async (): Promise<ConnectorResponse<Server>> => ({
        serveFile: "logout-start.html",
    });

    private handleLogoutPost = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Ensure the request comes from our origin
        this.validateSameOriginOrThrow(req);

        // This nonce will ensure authorization cookies are cleared automatically when KC returns
        const authFlowNonce = generators.nonce();

        // Build the redirect uri
        const redirectUri = this.buildRedirectUriOrThrow(authFlowNonce, true);

        // Grab the ID token
        const idToken = req.cookies?.[Cookies.ID_TOKEN];

        // Generate the logout url
        const logoutUrl = this.components.oidcClient.endSessionUrl({
            post_logout_redirect_uri: redirectUri,
            ...idToken && {id_token_hint: idToken},
        });

        return {
            redirectUrl: logoutUrl,
            statusCode: 303,
        }
    }

    private handleLogoutCallback = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Collect cookies to remove
        const cookies: CookieParams<Server>[] = [];

        // Strip auth cookies
        cookies.push(...this.removeAuthCookies(req.cookies));

        // Grab the auth flow nonce
        const authFlowNonce = this.getAuthFlowNonce(req);

        // Build the post logout redirect uri
        let postAuthRedirectUri = null;

        // Check for an auth flow nonce
        if (authFlowNonce) {
            // Strip auth flow cookies
            cookies.push(...this.removeAuthFlowCookies(req.cookies, authFlowNonce));

            // Grab the base64 logout redirect uri
            const logoutRedirectUri64 = req.cookies?.[`${Cookies.LOGOUT_REDIRECT_URI_B64}-${authFlowNonce}`];

            // Decode the base64 uri
            const postAuthRedirectUri = (!!logoutRedirectUri64) ? Buffer.from(logoutRedirectUri64, 'base64').toString() : null;

            // Validate the redirect uri
            this.validateRedirectUriOrThrow(postAuthRedirectUri);
        }

        return {
            statusCode: 303,
            cookies: cookies,
            redirectUrl: postAuthRedirectUri ?? this._config.serverOrigin,
        }
    }

    private handleClientJWKS = async (): Promise<ConnectorResponse<Server>> => {
        const keys = {
            "keys": await this.components.keyProvider.getPublicKeys(),
        };

        return {
            statusCode: 200,
            responseText: JSON.stringify(keys),
        };
    }

    private handleAdminMessages = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        //todo: what does keycloak send us???
        console.log(req);

        return {
            statusCode: 200,
            responseText: "TODO: finish1",
        };
    };

    private handleBackChannelLogout = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        //todo: finish backchannel logout. what does keycloak send us???
        console.log(req);

        const logoutToken = req.body?.['logout_token'];

        // Check for a lack of logout token(s)
        if (logoutToken === undefined) return {
            statusCode: 400
        }

        // Validate logout token
        const result = await this.validateJwt(logoutToken, JwtTokenTypes.LOGOUT);

        // ({payload: userData.accessToken} = await this.validateJwt(accessJwt));


        return {
            statusCode: 200,
            // responseText: "TODO: finish2",
        };
    };

    private handleLoginStatus = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {
        return {
            statusCode: 200,
            responseText: JSON.stringify({
                "user-is-logged-in": req.keycloak?.isAuthenticated ?? false,
            }),
        };
    }

    private removeAuthFlowCookies<Server extends SupportedServers>(reqCookies: unknown, authFlowNonce: string): CookieParams<Server>[] {
        const cookies: CookieParams<Server>[] = [];

        // Check if input is truthy
        if (!reqCookies) return cookies;

        // Scan through request cookies to find ones to remove
        for (const cookieName of Object.keys(reqCookies)) {
            if (CookieNames.some(name => `${name}-${authFlowNonce}` === cookieName) && !CookiesToKeep.includes(cookieName)) {
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

    private removeAuthCookies<Server extends SupportedServers>(reqCookies: unknown): CookieParams<Server>[] {
        const cookies: CookieParams<Server>[] = [];

        // Check if input is truthy
        if (!reqCookies) return cookies;

        // Scan through request cookies to find ones to remove
        for (const cookieName of Object.keys(reqCookies)) {
            if (CookiesToKeep.includes(cookieName)) {
                cookies.push({
                    name: cookieName,
                    value: "",
                    options: {
                        ...this.CookieOptions,
                        expires: new Date(0),
                    }
                })
            }
        }

        return cookies;
    }

    private validateJwt = async (jwt: string, type: JwtTokenTypes): Promise<JWTVerifyResult> => {

        let requiredClaims: string[] = [];

        // Snapshot the time
        const currDate = new Date();

        // Calculate max age
        let maxAge: number|string|null = (this.components.notBefore) ? (epoch(currDate) - this.components.notBefore) : null;

        switch (type) {
            case JwtTokenTypes.ID:
                requiredClaims = ['exp', 'auth_time'];
                break;
            case JwtTokenTypes.LOGOUT:
                // Override the max age. Logout messages should not come too late.
                maxAge = "10 minutes";
                break;
            case JwtTokenTypes.REFRESH:
                break;
            case JwtTokenTypes.ACCESS:
                break;

        }

        // Verify the token
        const verifyResult = await jose.jwtVerify(jwt, this.components.remoteJWKS, {
            algorithms: [KeycloakConnector.REQUIRED_ALGO],
            issuer: this.components.oidcIssuer.metadata.issuer,
            audience: this._config.oidcClientMetadata.client_id,
            typ: type,
            currentDate: currDate,
            ...maxAge && {maxTokenAge: maxAge},
            requiredClaims: requiredClaims,
        });

        // Validate azp declaration
        // Note - Based on OIDC Core 1.0 - draft 32 errata 2.0, we are encouraged not to use azp & ignore it when it does occur.
        //          The configuration below blends the requirement, verifying the azp if it exists otherwise ignoring it.
        const jwtAzp = verifyResult.payload['azp'];
        if ((jwtAzp !== undefined || type === JwtTokenTypes.ID) &&
            jwtAzp !== this.components.oidcClient.metadata.client_id) {
            throw new Error(`Mismatch AZP claim, expected ${this.components.oidcClient.metadata.client_id}`);
        }

        // Validate IAT is not too early
        const jwtIat = verifyResult.payload['iat'];
        if (this.components.notBefore && (jwtIat === undefined || isNaN(jwtIat) || jwtIat < this.components.notBefore)) {
            throw new Error(`Invalid IAT claim. Claim is missing, not a number, or before "notBefore" time declared by OP`);
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
            ({payload: userData.accessToken} = await this.validateJwt(accessJwt, JwtTokenTypes.ACCESS));

        } catch (e) {

            // Log if only to detect attacks
            this._config.pinoLogger?.warn(e, 'Could not obtain user data from request');

            return userData;

        }

        //todo: test if the validate function checks for old authentications

        userData.isAuthenticated = true;

        // Check if the page is public anyway OR is the page is protected, but there is no role requirement
        if (req.routeConfig.public || (Array.isArray(req.routeConfig.roles) && req.routeConfig.roles.length === 0)) {
            userData.isAuthorized = true;

        } else if (req.routeConfig.roles) {
            // Check for required roles
            userData.isAuthorized = this.roleHelper.userHasRoles(req.routeConfig.roles, userData.accessToken);

        } else {
            this._config.pinoLogger?.error("Invalid route configuration, must specify roles if route is not public.");
            throw new Error('Invalid route configuration, must specify roles if route is not public.');
        }

        // Add reference to user data on the request as well
        req.keycloak = userData;

        return userData;
    }

    public buildRouteProtectionResponse = async (req: ConnectorRequest, userData: UserData): Promise<ConnectorResponse<Server> | undefined> => {

        // Return immediately if the route is public or the user is authorized
        if (req.routeConfig.public || userData.isAuthorized) return;

        // Check if unauthenticated
        if (!userData.isAuthenticated) {

            //todo: auto update their access token?? probably not here. move to the user data function

            // // Auto redirect to login page
            // if (req.routeConfig.autoRedirect !== false && req.headers['sec-fetch-mode'] === 'navigate') {
            //     return new ConnectorErrorRedirect(this.getRoutePath(RouteEnum.LOGIN_PAGE), ErrorHints.UNAUTHENTICATED);
            // }
            // Auto-show login page
            if (req.routeConfig.autoRedirect !== false && req.headers['sec-fetch-mode'] === 'navigate') {
                return await this.handleLoginGet();
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

    private updateOidcServer = async () => {
        const updateId = webcrypto.randomUUID();

        for (let retries= 0; retries<4; retries++) {
            try {
                await this.components.oidcClient.introspect("");
                this._config.pinoLogger?.debug(`(id: ${updateId}) Successfully updated oidc server`);
                return;
            } catch (e) {
                this._config.pinoLogger?.debug(`(id: ${updateId}) Failed to introspect during oidc server update: ${Date.now()}`);
            }

            this._config.pinoLogger?.debug(`(id: ${updateId}) Waiting until next introspect`);
            await sleep(10 * 2500);
            this._config.pinoLogger?.debug(`(id: ${updateId}) Retrying introspect`);
        }
    }

    private updateOpenIdConfig = async () => {

        // Return the existing pending promise
        if (this.updateOidcConfigPending) {
            this._config.pinoLogger?.debug(`OIDC update in progress and new update already pending`);
            return this.updateOidcConfigPending;
        }

        // Check for an ongoing update and create a pending promise
        if (this.updateOidcConfig) {
            this._config.pinoLogger?.debug(`OIDC update in progress, creating pending update`);
            this.updateOidcConfigPending = this.updateOidcConfig.then(async (): Promise<boolean> => {
                this._config.pinoLogger?.debug(`Starting pending OIDC update`);

                // Clear the pending promise
                this.updateOidcConfigPending = null;

                // Call the script again
                return await this.updateOpenIdConfig();
            });

            return this.updateOidcConfigPending;
        }

        // Store the update promise
        this.updateOidcConfig = (async () => {
            try {
                this._config.pinoLogger?.debug(`Starting OIDC update`);

                let shouldUpdate = false;

                // Attempt to grab a new configuration
                const newOidcConfig = await KeycloakConnector.fetchOpenIdConfig(this.components.oidcDiscoveryUrl, this._config);

                // Check for a configuration and check it is an update to the existing one
                if (newOidcConfig && JSON.stringify(newOidcConfig) !== JSON.stringify(this.components.oidcConfig)) {
                    // Store the configuration
                    this.components.oidcConfig = newOidcConfig;
                    shouldUpdate = true;
                }

                // Ensure we have a JWKS uri
                if (this.components.oidcConfig.jwks_uri === undefined) {
                    this._config.pinoLogger?.error(`Authorization server provided no JWKS_URI, cannot find public keys to verify tokens against`);
                    return false;
                }

                // Attempt to grab an updated set of remote JWKs
                const newRemoteJWKS = KeycloakConnector.createRemoteJWTSet(this.components.oidcConfig.jwks_uri)

                // Grab the latest connector keys
                const newConnectorKeys = await this.components.keyProvider.getActiveKeys();

                if (newConnectorKeys !== this.components.connectorKeys) {
                    // Store the new keys
                    this.components.connectorKeys = newConnectorKeys;
                    shouldUpdate = true;
                }

                // Check if we should update
                if (!shouldUpdate) {
                    this._config.pinoLogger?.debug(`No changes to OIDC keys or configuration, not updating!`);
                    return true;
                }

                // Handle configuration change
                ({
                    oidcIssuer: this.components.oidcIssuer,
                    oidcClient: this.components.oidcClient
                } = await KeycloakConnector.createOidcClients(this.components.oidcConfig, this._config.oidcClientMetadata, this.components.connectorKeys.privateJwk));

                this._config.pinoLogger?.debug(`OIDC update complete`);
                return true;

            } catch (e) {
                this._config.pinoLogger?.error(`Failed to update OIDC configuration: ${e}`);
                return false;
            } finally {
                // Clear the active update promise
                this.updateOidcConfig = null;
            }
        })();

        // Await the function call
        return await this.updateOidcConfig;
    };

    static async init<Server extends SupportedServers>(adapter: AbstractAdapter<Server>, customConfig: KeycloakConnectorConfigCustom) {

        // Sanity check configuration
        if (!isDev() && customConfig.serverOrigin === undefined) throw new Error(`Must specify server origin for non-dev builds`);

        // Placeholder to help ID missing configuration information (prevent a "magic number" situation)
        const EMPTY_STRING = "";

        const config: KeycloakConnectorConfigBase = {
            // Defaults
            refreshConfigMins: 30,
            authCookieTimeout: 35 * 60 * 1000, // Default: 35 minutes
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
                    KeycloakConnector.getRouteUri(RouteEnum.LOGOUT_CALLBACK, customConfig),
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
        if (config.oidcClientMetadata.client_id === EMPTY_STRING) throw new Error(`Client ID not specified or environment variable "KC_CLIENT_ID" not found`);
        if (config.oidcClientMetadata.redirect_uris === undefined || config.oidcClientMetadata.redirect_uris.length === 0)  throw new Error(`No login redirect URIs specified`);
        if (config.oidcClientMetadata.post_logout_redirect_uris === undefined || config.oidcClientMetadata.post_logout_redirect_uris.length === 0)  throw new Error(`No post logout redirect URIs specified`);

        // Manipulate pino logger to embed a _prefix into each message
        if (config.pinoLogger) config.pinoLogger = config.pinoLogger.child({"Source": "KeycloakConnector"});

        // Build the oidc discovery url (ref: https://issues.redhat.com/browse/KEYCLOAK-571)
        const authPath = (config.keycloakVersionBelow18) ? "/auth" : "";
        const oidcDiscoveryUrl = config.oidcDiscoveryUrlOverride ?? `${config.authServerUrl}${authPath}/realms/${config.realm}/.well-known/openid-configuration`;

        // Attempt to connect to a cluster
        await config.clusterProvider?.connectOrThrow();

        // Grab the oidc configuration from the OP
        const openIdConfig = await KeycloakConnector.fetchInitialOpenIdConfig(oidcDiscoveryUrl, config);

        // Grab the server's private/public JWKs (uses the standalone key provider as default)
        const keyProviderConfig: KeyProviderConfig = {
            ...config.pinoLogger && {pinoLogger: config.pinoLogger},
            ...config.clusterProvider && {clusterProvider: config.clusterProvider},
        }
        const keyProvider = await (config.keyProvider ?? standaloneKeyProvider)(keyProviderConfig)
        const connectorKeys = await keyProvider.getActiveKeys();

        // Grab the oidc clients
        const oidcClients = await KeycloakConnector.createOidcClients(openIdConfig, config.oidcClientMetadata, connectorKeys.privateJwk);

        // Ensure we have a JWKS uri
        if (oidcClients.oidcIssuer.metadata.jwks_uri === undefined) {
            throw new Error('Authorization server provided no JWKS_URI, cannot find public keys to verify tokens against');
        }

        // Store the OP JWK set
        const remoteJWKS = KeycloakConnector.createRemoteJWTSet(oidcClients.oidcIssuer.metadata.jwks_uri);

        const components: KeycloakConnectorInternalConfiguration = {
            oidcDiscoveryUrl: oidcDiscoveryUrl,
            oidcConfig: openIdConfig,
            keyProvider: keyProvider,
            ...oidcClients,
            remoteJWKS: remoteJWKS,
            connectorKeys: connectorKeys,
            notBefore: undefined,
        }

        // Return the new connector
        return new this<Server>(config, components, adapter);
    }

    private static createRemoteJWTSet(jwksUri: string) {
        return jose.createRemoteJWKSet(new URL(jwksUri), {
            cacheMaxAge: Infinity,
            cooldownDuration: 10,
        });
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
            // (logging to console as well since this error is easily hidden by a litany of other messages)
            console.error(`Start up error, failed to fetch auth server configuration ...retrying in ${backoffSecs} seconds`);
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
            case RouteEnum.LOGOUT_PAGE:
                return `${prefix}${config.routePaths?.logoutPage ?? RouteUrlDefaults.logoutPage}`;
            case RouteEnum.LOGOUT_POST:
                return `${prefix}${config.routePaths?.logoutPost ?? RouteUrlDefaults.logoutPost}`;
            case RouteEnum.CALLBACK:
                return `${prefix}${config.routePaths?.callback ?? RouteUrlDefaults.callback}`;
            case RouteEnum.LOGOUT_CALLBACK:
                return `${prefix}${config.routePaths?.logout_callback ?? RouteUrlDefaults.logout_callback}`;
            case RouteEnum.PUBLIC_KEYS:
                return `${prefix}${config.routePaths?.publicKeys ?? RouteUrlDefaults.publicKeys}`;
            case RouteEnum.ADMIN_URL:
                return `${prefix}${config.routePaths?.adminUrl ?? RouteUrlDefaults.adminUrl}`;
            case RouteEnum.BACK_CHANNEL_LOGOUT:
                return `${prefix}${config.routePaths?.backChannelLogout ?? RouteUrlDefaults.backChannelLogout}`;
            case RouteEnum.LOGIN_STATUS:
                return `${prefix}${config.routePaths?.loginStatus ?? RouteUrlDefaults.loginStatus}`;
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