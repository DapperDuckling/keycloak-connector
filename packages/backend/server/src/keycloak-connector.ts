import {sleep} from "./helpers/utils.js";
import {
    type ClientMetadata,
    errors,
    generators,
    Issuer,
    type IssuerMetadata,
    TokenSet,
    type UserinfoResponse
} from "openid-client";
import {
    type ConnectorRequest,
    type ConnectorResponse,
    type CookieOptionsBase,
    type CookieParams,
    type KeycloakConnectorConfigBase,
    type KeycloakConnectorConfigCustom,
    type KeycloakConnectorInternalConfiguration,
    type RefreshTokenSet,
    type RefreshTokenSetResult,
    StateOptions,
    type SupportedServers,
    type UserData,
    type UserDataResponse,
    VerifiableJwtTokenTypes
} from "./types.js";
import type {AbstractAdapter, ConnectorCallback, RouteRegistrationOptions} from "./adapter/abstract-adapter.js";
import type {JWK} from "jose";
import * as jose from 'jose';
import {ConnectorErrorRedirect, ErrorHints, LoginError} from "./helpers/errors.js";
import {
    ConnectorCookies,
    epoch,
    getRoutePath,
    isDev, isObject,
    RouteEnum, RouteUrlDefaults,
    SilentLoginEvent,
    type SilentLoginMessage,
    SilentLoginTypes,
    type UserStatus,
    type UserStatusWrapped
} from "@dapperduckling/keycloak-connector-common";
import {UserDataDefault} from "./helpers/defaults.js";
import type {JWTPayload, JWTVerifyResult} from "jose/dist/types/types.js";
import {RoleHelper} from "./helpers/role-helper.js";
import type {KeyProviderConfig} from "./crypto/index.js";
import {standaloneKeyProvider} from "./crypto/index.js";
import {webcrypto} from "crypto";
import {TokenCache, UserInfoCache} from "./cache-adapters/index.js";
import {AuthPluginManager} from "./auth-plugins/index.js";
import {silentLoginResponseHTML} from "./browser-login-helpers/silent-login.js";
import hash from "object-hash";
import {fileURLToPath} from "url";
import path, {dirname} from "path";
import RPError = errors.RPError;
import OPError = errors.OPError;
import {loginListenerHTML} from "./browser-login-helpers/login-listener.js";
import * as fs from "fs";
import {CookieStore} from "./cookie-store.js";

const STATIC_FILE_DIR = [dirname(fileURLToPath(import.meta.url)), 'static', ""].join(path.sep);

export class KeycloakConnector<Server extends SupportedServers> {

    public static readonly REQUIRED_ALGO = 'PS256'; // FAPI required algo, see: https://openid.net/specs/openid-financial-api-part-2-1_0.html
    private readonly HTML_PAGES: Record<string, string> = {
        login: fs.readFileSync(`${STATIC_FILE_DIR}login-start.html`, 'utf8'),
        logout: fs.readFileSync(`${STATIC_FILE_DIR}logout-start.html`, 'utf8'),
    } as const;

    private readonly _config: KeycloakConnectorConfigBase;
    private readonly components: KeycloakConnectorInternalConfiguration;
    private readonly roleHelper: RoleHelper;
    private readonly authPluginManager: AuthPluginManager;
    private readonly validRedirectOrigins: string[];
    private readonly cookieStoreGenerator: ReturnType<typeof CookieStore.generator>;
    private oidcConfigTimer: ReturnType<typeof setTimeout> | null = null;
    private updateOidcConfig: Promise<boolean> | null = null;
    private updateOidcConfigPending: Promise<boolean> | null = null;

    private readonly CookieOptions: CookieOptionsBase<Server> = {
        sameSite: "strict",
        httpOnly: true,
        secure: true,
        path: "/",
        // ...{partitioned: true}, // hacky way of getting ahead of 3p cookie blocking
    }

    private readonly CookieOptionsLax: CookieOptionsBase<Server> = {
        ...this.CookieOptions,
        sameSite: "lax",
    }
    private readonly CookieOptionsUnrestricted: CookieOptionsBase<Server> = {
        ...this.CookieOptions,
        sameSite: "none",
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

        // Setup the auth plugin manager
        this.authPluginManager = AuthPluginManager.init({
            baseHandler: this.isUserAuthorized,
            keycloakConfig: this._config,
            ...this._config.pinoLogger && {logger: this._config.pinoLogger},
        });

        // Register the routes using the connector adapter
        this.registerRoutes(adapter);

        // Grab all the valid redirect origins
        this.validRedirectOrigins = [
            this._config.serverOrigin,
            ...(this._config.validOrigins ?? []),
        ]

        // Register the on key update listener
        this.components.keyProvider.registerCallbacks(
            this.updateOpenIdConfig,
            this.updateOidcServer
        );

        // Update the static pages to include the server origin
        const staticPageReplacements: Record<string, string> = {
            serverOrigin: this._config.serverOrigin,
            urlPrefix: this._config.routePaths?._prefix ?? RouteUrlDefaults._prefix
        }

        for (const [fileKey, htmlContents] of Object.entries(this.HTML_PAGES)) {
            // Simple match and replace
            this.HTML_PAGES[fileKey] = htmlContents.replaceAll(/\${(\w*)}/g, (match, key) => staticPageReplacements[key] ?? match);
        }

        const globalCookieOptions: CookieParams<Server>['options'] = {};

        // Determine the wildcard cookie base domain
        if (this._config.wildcardCookieBaseDomain) {
            // Validate the domain
            try {
                const url = new URL(`https://${this._config.wildcardCookieBaseDomain}`);
                globalCookieOptions.domain = `.` + url.hostname; // Prepend a wildcard marker
            } catch (e) {
                throw new Error(`Value provided for wildcardCookieBaseDomain not a valid domain. Got "${this._config.wildcardCookieBaseDomain}".`);
            }
        }

        // Setup the cookie generator
        this.cookieStoreGenerator = CookieStore.generator(globalCookieOptions);
    }

    public getExposed = () => ({
        registerAuthPlugin: this.authPluginManager.registerAuthPlugin,
        config: this.config,
    });

    private registerRoutes(adapter: AbstractAdapter<Server>): void {

        /**
         * Shows the client provided login page
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.LOGIN_PAGE),
            method: "GET",
            isUnlocked: true,
        }, this.handleLoginGet);

        /**
         * Handles the redirect to the OP for user login
         */
        this.registerRoute(adapter,{
            url: this.getRoutePath(RouteEnum.LOGIN_POST),
            method: "POST",
            isUnlocked: true,
        }, this.handleLoginPost);

        /**
         * Serves the silent listener page for cross-origin communications
         */
        this.registerRoute(adapter,{
            url: this.getRoutePath(RouteEnum.LOGIN_LISTENER),
            method: "GET",
            isUnlocked: true,
        }, this.handleLoginListener);

        /**
         * Handles the callback from the OP
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.CALLBACK),
            method: "GET",
            isUnlocked: true,
        }, this.handleCallbackWrapped);

        /**
         * Shows the client provided logout page
         */
        this.registerRoute(adapter,{
            url: this.getRoutePath(RouteEnum.LOGOUT_PAGE),
            method: "GET",
            isUnlocked: true,
        }, this.handleLogoutGet);

        /**
         * Handles the redirect to the OP for user logout
         */
        this.registerRoute(adapter,{
            url: this.getRoutePath(RouteEnum.LOGOUT_POST),
            method: "POST",
            isUnlocked: true,
        }, this.handleLogoutPost);


        /**
         * Handles the logout redirect from the OP
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.LOGOUT_CALLBACK),
            method: "GET",
            isUnlocked: true,
        }, this.handleLogoutCallback);

        /**
         * Serves the JWK set containing the client's public key
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.PUBLIC_KEYS),
            method: "GET",
            isUnlocked: true,
        }, this.handleClientJWKS);

        /**
         * Handles any back channel logout messages from keycloak
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.ADMIN_URL),
            method: "POST",
            isUnlocked: true,
        }, this.handleAdminMessages);

        /**
         * Handles any back channel logout messages from keycloak
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.BACK_CHANNEL_LOGOUT),
            method: "POST",
            isUnlocked: true,
        }, this.handleBackChannelLogout);

        /**
         * Provides a quick endpoint for client side scripts to check status of authentication
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.USER_STATUS),
            method: "GET",
            isUnlocked: true,
        }, this.handleUserStatus);

        /**
         * Provides access to the public directory of this plugin
         */
        this.registerRoute(adapter, {
            url: this.getRoutePath(RouteEnum.PUBLIC_DIR),
            method: "GET",
            isUnlocked: true,
            serveStaticOptions: {
                root: STATIC_FILE_DIR,
            },
        }, this.handleFailedStaticServe);
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

    private handleFailedStaticServe = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {
        this._config.pinoLogger?.error("Failed to serve static file");
        return {
            statusCode: 500,
        }
    }

    private handleLoginGet = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {
        // Check if the user is already logged in
        const redirectIfAuthenticated = await this.redirectIfAuthenticated(req, false);
        if (redirectIfAuthenticated) return redirectIfAuthenticated;

        // Otherwise, serve the login page
        return {
            responseHtml: this.HTML_PAGES['login'] ?? "Failed to load",
        }
    }

    private silentRequestConfig = (req: ConnectorRequest): [SilentLoginTypes, string] => {
        // Ensure there is a token passed
        const token = req.urlQuery["silent-token"];
        if (token === undefined || typeof token !== "string") return [SilentLoginTypes.NONE, ""];

        // Determine the silent type
        const silentParam = (typeof req.urlQuery["silent"] === "string") ? req.urlQuery["silent"] : undefined
        // @ts-ignore - Ignoring string can't be a part of the login types... that's why I'm using "includes" dummy!
        const silentType = (silentParam && Object.values(SilentLoginTypes).includes(silentParam)) ? silentParam : SilentLoginTypes.NONE;

        return [silentType as SilentLoginTypes, token];
    }

    private originFromQuery = (req: ConnectorRequest): string | undefined => {
        const sourceOriginParam = req.urlQuery['source-origin'];

        return typeof sourceOriginParam === "string" ? sourceOriginParam : undefined;
    }

    private redirectIfAuthenticated = async (req: ConnectorRequest, originRequired = true): Promise<ConnectorResponse<Server> | false> => {
        // Check if the user is already logged in
        if (req.kccUserData?.isAuthenticated !== true) return false;

        // Do a quick origin check
        try {
            this.validateOriginOrThrow(req, originRequired);
        } catch (e) {
            // Do not continue auth redirect
            return false;
        }

        // Set flag to invalidate the user info (force a pull of the latest data if later required)
        // Dev note: Doing this over forcibly invalidating the cache as some requests handled by this function may not require it
        req.routeConfig.verifyUserInfoWithServer = true;

        // Determine the silent login status
        const [silentRequestType] = this.silentRequestConfig(req);

        // Silent, return data via silent login response
        if (silentRequestType !== SilentLoginTypes.NONE) {
            return this.handleSilentLoginResponse(req, this.cookieStoreGenerator(), SilentLoginEvent.LOGIN_SUCCESS, req.origin);
        }

        // Validate the redirect uri (or throw)
        const rawPostAuthRedirectUri = req.urlQuery['post_auth_redirect_uri'] ?? undefined;
        let redirectUri = undefined
        if (typeof rawPostAuthRedirectUri === "string") {
            this.validateRedirectUriOrThrow(rawPostAuthRedirectUri);
            redirectUri = rawPostAuthRedirectUri;
        }

        return {
            statusCode: 303,
            redirectUrl: redirectUri ?? this._config.redirectUri ?? this._config.serverOrigin,
        }
    }

    private handleLoginPost = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Ensure the request comes from an allowed origin
        const sourceOrigin = this.validateOriginOrThrow(req);

        // Check if the user is already logged in
        const redirectIfAuthenticated = await this.redirectIfAuthenticated(req);
        if (redirectIfAuthenticated) return redirectIfAuthenticated;

        // Generate random values
        const cv = generators.codeVerifier();

        // The login flow nonce is a custom parameter to help the user experience in case they attempt to sign in across multiple pages at the same time
        // Once KC returns a valid login, the nonce will be used to grab the cookies unique to this login attempt
        const authFlowNonce = generators.nonce();

        // Check if this is a silent request
        const [silentRequestType, silentRequestToken] = this.silentRequestConfig(req);

        // Build the redirect uri
        const redirectUri = this.buildRedirectUriOrThrow({
            authFlowNonce: authFlowNonce,
            sourceOrigin: sourceOrigin,
            silentRequestType: silentRequestType,
            silentRequestToken: silentRequestToken
        });

        const authorizationUrl = this.components.oidcClient.authorizationUrl({
            code_challenge_method: "S256",
            code_challenge: generators.codeChallenge(cv),
            redirect_uri: redirectUri,
            response_mode: "jwt",
            scope: "openid",
            ...(silentRequestType === SilentLoginTypes.FULL) && {prompt: "none"},
        });

        // Collect the cookies we would like the server to send back
        const cookies = this.cookieStoreGenerator();

        // Build the code verifier cookie
       cookies.add({
            name: `${ConnectorCookies.CODE_VERIFIER}-${authFlowNonce}`,
            value: cv,
            options: {
                ...(this.hasOtherOrigins()) ? this.CookieOptionsUnrestricted : this.CookieOptionsLax,
                expires: new Date(+new Date() + this._config.authCookieTimeout),
            }
        });

        // Add the redirect cookie
        const redirectCookie = this.buildRedirectCookie({
            req: req,
            authFlowNonce: authFlowNonce,
        });

       cookies.add(redirectCookie);

        return {
            redirectUrl: authorizationUrl,
            statusCode: 303,
            cookies: cookies,
        }
    }

    private handleLoginListener = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Grab the source origin from the query
        const sourceOrigin = this.originFromQuery(req);

        // Ensure the origin is allowed
        if (sourceOrigin === undefined || !this.validRedirectOrigins.includes(sourceOrigin)) return {
            statusCode: 400
        }

        // Serve the login listener page
        return {
            statusCode: 200,
            responseHtml: loginListenerHTML(sourceOrigin, process.env?.['DEBUG_SILENT_IFRAME'] !== undefined)
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

        // Check for no redirect origin
        if (redirectUriOrigin === undefined) {
            this._config.pinoLogger?.debug(`No redirect uri origin to process`);
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Check for good origin
        if (this.validRedirectOrigins.includes(redirectUriOrigin)) return true;

        // Log the potentially dangerous error
        this._config.pinoLogger?.warn({
            redirectUrlOrigin: redirectUriOrigin,
            serverOrigin: this._config.serverOrigin,
        });
        this._config.pinoLogger?.error(`Login redirect url origin does not match server origin!`);
        throw new LoginError(ErrorHints.CODE_400);
    }

    private validateOriginOrThrow = (req: ConnectorRequest, required = true): string | undefined => {

        // Check for a missing origin when not required
        if (!required && req.origin === undefined) return;

        // Check for dev and the server has a "localhost" origin
        const hostname = (URL.canParse(this._config.serverOrigin)) ? (new URL(this._config.serverOrigin))?.hostname : undefined;
        if (isDev() && hostname === "localhost") return req.origin;

        // Check for good origin
        if (req.origin && this.validRedirectOrigins.includes(req.origin)) return req.origin;

        // Log this error (possibly detect attacks)
        this._config.pinoLogger?.warn(`Request came from different origin. Server origin: ${this._config.serverOrigin}, Got: ${req.origin}. Add to valid origins configuration if required.`);

        throw new LoginError(ErrorHints.CODE_400);
    }

    public getCorsHeaders = (req: ConnectorRequest) => {

        // Check for no origin header
        if (req.origin === undefined) return;

        // Ensure the origin is valid
        try {
            this.validateOriginOrThrow(req);
        } catch (e) {
            // No cors headers with an invalid origin
            return;
        }

        return {
            "Access-Control-Allow-Origin": req.origin,
            "Access-Control-Allow-Methods": "GET, POST",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Max-Age": "3600" // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Max-Age#delta-seconds
        }
    }

    private buildRedirectCookie = (opts: {
        req: ConnectorRequest,
        authFlowNonce: string,
        isLogout?: boolean
    }): CookieParams<Server>[] => {

        // Grab the individual properties
        const {req, authFlowNonce, isLogout} = opts;

        // Handle the post login redirect uri
        let rawPostAuthRedirectUri: string|null;
        try {
            const inputUrlObj = new URL(req.url, req.origin);
            rawPostAuthRedirectUri = inputUrlObj.searchParams.get('post_auth_redirect_uri');
        } catch (e) {
            return [];
        }

        try {
            this.validateRedirectUriOrThrow(rawPostAuthRedirectUri);
        } catch (e) {
            return [];
        }

        let rawPostAuthRedirectUriObj: URL;

        try {
            rawPostAuthRedirectUriObj = new URL(rawPostAuthRedirectUri ?? "");
        } catch (e) {
            return [];
        }

        // Check if the post auth redirect is the same as the start pages
        if ((!isLogout && rawPostAuthRedirectUriObj.pathname === this.getRoutePath(RouteEnum.LOGIN_PAGE)) ||
            (isLogout && rawPostAuthRedirectUriObj.pathname === this.getRoutePath(RouteEnum.LOGOUT_PAGE))) return [];

        const postAuthRedirectUri = rawPostAuthRedirectUriObj.toString();
        const baseCookieName = (!isLogout) ? ConnectorCookies.REDIRECT_URI_B64 : ConnectorCookies.LOGOUT_REDIRECT_URI_B64;

        return [{
            name: `${baseCookieName}-${authFlowNonce}`,
            value: Buffer.from(postAuthRedirectUri).toString('base64'),
            options: {
                ...this.CookieOptionsLax,
                expires: new Date(+new Date() + this._config.authCookieTimeout),
            }
        }];
    }

    private buildRedirectUriOrThrow = (config: {
        authFlowNonce: string,
        sourceOrigin?: string | undefined,
        isLogout?: boolean,
        silentRequestType?: SilentLoginTypes,
        silentRequestToken?: string,
    }): string => {

        // Grab the base redirect uri
        const redirectUriBase = (!config.isLogout) ?
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
        redirectUriObj.searchParams.append("auth_flow_nonce", config.authFlowNonce);

        // Add the silent query param
        if (config.silentRequestToken && config.silentRequestType && config.silentRequestType !== SilentLoginTypes.NONE) {
            redirectUriObj.searchParams.append("silent", config.silentRequestType);
            redirectUriObj.searchParams.append("silent-token", config.silentRequestToken);
        }

        // Add the source origin query param
        if (config.sourceOrigin) {
            redirectUriObj.searchParams.append("source-origin", config.sourceOrigin);
        }

        return redirectUriObj.toString();
    }

    private getAuthFlowNonce = (req: ConnectorRequest): string|null => {
        // Check for login flow nonce
        // (`base` of "localhost" added since browsers are not required to send an origin for all requests. It has no other function than to allow the built-in `URL` class to work in-line)
        return (new URL(req.url, "https://localhost")).searchParams.get('auth_flow_nonce');
    }

    private handleCallbackWrapped = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {
        try {
            return await this.handleCallback(req);
        } catch (e) {
            // Determine the silent login status
            const [silentRequestType] = this.silentRequestConfig(req);

            // Silent, return data via silent login response
            if (silentRequestType !== SilentLoginTypes.NONE) {
                return this.handleSilentLoginResponse(req, this.cookieStoreGenerator(), SilentLoginEvent.LOGIN_ERROR, req.origin);
            }

            // Rethrow on non-silent requests
            throw e;
        }
    }

    private handleCallback = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // todo: Removed origin check since this is a get request
        // // Ensure the request comes from an allowed origin
        // this.validateOriginOrThrow(req);

        // Grab the auth flow nonce
        const authFlowNonce = this.getAuthFlowNonce(req);

        // Check for missing auth flow nonce
        if (authFlowNonce === null) {
            // Log the bad request
            this._config.pinoLogger?.warn(req.url);
            this._config.pinoLogger?.warn("Missing login flow nonce parameter during login attempt");

            // Redirect the user back to the login page
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Ingest required cookies
        let inputCookies: {
            codeVerifier: string | undefined;
            redirectUriRaw: string | undefined;
        };

        try {
            const redirectUri64 = req.cookies?.[`${ConnectorCookies.REDIRECT_URI_B64}-${authFlowNonce}`];

            // Grab the input cookies
            inputCookies = {
                codeVerifier: req.cookies[`${ConnectorCookies.CODE_VERIFIER}-${authFlowNonce}`],
                redirectUriRaw: (!!redirectUri64) ? Buffer.from(redirectUri64, 'base64').toString() : undefined,
            }
        } catch (e) {

            // Log the bad request
            if (isObject(e)) this._config.pinoLogger?.warn(e);
            this._config.pinoLogger?.warn("Invalid cookie(s) from browser during login attempt");

            // Redirect the user back to the login page
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Check if this is a silent request
        const [silentRequestType, silentRequestToken] = this.silentRequestConfig(req);

        // Grab the source origin of the initial request from the query param
        const sourceOrigin = this.originFromQuery(req);

        // Build the redirect uri
        const redirectUri = this.buildRedirectUriOrThrow({
            authFlowNonce: authFlowNonce,
            sourceOrigin: sourceOrigin,
            silentRequestType: silentRequestType,
            silentRequestToken: silentRequestToken
        });

        // Check for a code verifier
        if (inputCookies.codeVerifier === undefined) {
            // Log the bad request (to possibly detect attacks)
            this._config.pinoLogger?.warn("Missing code verifier during login attempt");

            // Redirect the user back to the login page
            throw new LoginError(ErrorHints.CODE_400);
        }

        // Build the post login redirect uri
        const postAuthRedirectUri = inputCookies.redirectUriRaw ?? null;

        // Validate the redirect uri (or throw)
        this.validateRedirectUriOrThrow(postAuthRedirectUri);

        // Grab and add the cookies to remove (for immediate expiration)
        const cookies = this.cookieStoreGenerator().removeAuthFlowCookies(req.cookies, authFlowNonce, {
            ...this.CookieOptionsLax,
        });

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

            // Pass the new TokenSet to the handler and grab the resultant cookie(s)
            const tokenSetCookies = this.validateAndHandleTokenSet(tokenSet);

            // Merge in the token set cookies
            cookies.merge(tokenSetCookies);

            // Return a silent login response if required
            if (silentRequestType !== SilentLoginTypes.NONE) {
                return this.handleSilentLoginResponse(req, cookies, SilentLoginEvent.LOGIN_SUCCESS, sourceOrigin);
            }

            return {
                statusCode: 303,
                cookies: cookies,
                redirectUrl: postAuthRedirectUri ?? this._config.redirectUri ?? this._config.serverOrigin,
            }

        } catch (e) {

            // Check if silent login requires login
            if (silentRequestType !== SilentLoginTypes.NONE &&
                e instanceof OPError &&
                (e.message.includes("login_required") || e.message.includes("interaction_required"))
            ) {
                return this.handleSilentLoginResponse(req, cookies, SilentLoginEvent.LOGIN_REQUIRED, sourceOrigin);
            }

            if (e instanceof RPError) {
                // Check for an expired JWT
                if (e.message.includes("JWT expired")) {
                    // Hint to the login page the user took too long
                    throw new LoginError(ErrorHints.JWT_EXPIRED);
                } else if (e.message.includes("request timed out after")) {

                    // Log the issue as the OP may not be able to handle the requests or
                    // the RP (this server) is not able to connect to the OP
                    this._config.pinoLogger?.error(e);
                    this._config.pinoLogger?.error(`Timed out while connecting to the OP. It is possible the OP is still trying to fetch this server's public key and has not yet timed out from that response before we did here.`);

                } else {
                    // Log the issue as a possibility to detect attacks
                    this._config.pinoLogger?.warn(e);
                    this._config.pinoLogger?.warn(`Failed to complete login, RP error`);

                    // This could be 400 or 500 error
                    throw new LoginError(ErrorHints.UNKNOWN);
                }
            } else if (e instanceof OPError) {
                // Log the issue
                this._config.pinoLogger?.error(e);
                this._config.pinoLogger?.error(`Unexpected response from OP`);

            } else {
                // Log the issue
                if (isObject(e)) this._config.pinoLogger?.error(e);
                this._config.pinoLogger?.error(`Unexpected error during login`);
            }

            throw new LoginError(ErrorHints.CODE_500);
        }
    }

    private handleLogoutGet = async (): Promise<ConnectorResponse<Server>> => ({
        responseHtml: this.HTML_PAGES['logout'] ?? "Failed to load",
    });

    private handleLogoutPost = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Ensure the request comes from an allowed origin
        this.validateOriginOrThrow(req);

        // This nonce will ensure authorization cookies are cleared automatically when KC returns
        const authFlowNonce = generators.nonce();

        // Build the redirect uri
        const redirectUri = this.buildRedirectUriOrThrow({authFlowNonce: authFlowNonce, isLogout: true});

        // Add the redirect cookie
        const redirectCookie = this.buildRedirectCookie({
            req: req,
            authFlowNonce: authFlowNonce,
            isLogout: true,
        });

        const redirectCookies = this.cookieStoreGenerator().add(redirectCookie);

        // Grab the ID token
        const idToken = req.cookies?.[ConnectorCookies.ID_TOKEN];

        // Generate the logout url
        const logoutUrl = this.components.oidcClient.endSessionUrl({
            post_logout_redirect_uri: redirectUri,
            ...idToken && {id_token_hint: idToken},
            client_id: this.components.oidcClient.metadata.client_id,
            prompt: 'none'
        });

        // Grab the cors headers
        const corsHeaders = this.getCorsHeaders(req);

        return {
            ...corsHeaders && {headers: corsHeaders},
            redirectUrl: logoutUrl,
            statusCode: 303,
            cookies: redirectCookies,
        }
    }

    private handleLogoutCallback = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {

        // Collect cookies to remove
        const cookies = this.cookieStoreGenerator();

        // Strip auth cookies
        cookies.removeAuthCookies(req.cookies, {
            ...(this.hasOtherOrigins()) ? this.CookieOptionsUnrestricted : this.CookieOptions
        });

        // Grab the auth flow nonce
        const authFlowNonce = this.getAuthFlowNonce(req);

        // Build the post logout redirect uri
        let postAuthRedirectUri = null;

        // Check for an auth flow nonce
        if (authFlowNonce) {
            // Strip auth flow cookies
            cookies.removeAuthFlowCookies(req.cookies, authFlowNonce);

            // Grab the base64 logout redirect uri
            const logoutRedirectUri64 = req.cookies?.[`${ConnectorCookies.LOGOUT_REDIRECT_URI_B64}-${authFlowNonce}`];

            // Decode the base64 uri
            postAuthRedirectUri = (!!logoutRedirectUri64) ? Buffer.from(logoutRedirectUri64, 'base64').toString() : null;

            // Validate the redirect uri (or throw)
            this.validateRedirectUriOrThrow(postAuthRedirectUri);
        }

        return {
            statusCode: 303,
            cookies: cookies,
            redirectUrl: postAuthRedirectUri ?? this._config.redirectUri ?? this._config.serverOrigin,
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const logoutToken = req.body?.['logout_token'];

        // Check for a lack of logout token(s)
        if (logoutToken === undefined) return {
            statusCode: 400
        }

        // Validate logout token
        const result = await this.validateJwtOrThrow(logoutToken, VerifiableJwtTokenTypes.LOGOUT);

        // ({payload: userData.accessToken} = await this.validateJwt(accessJwt));

        console.log(result);


        return {
            statusCode: 200,
            // responseText: "TODO: finish2",
        };
    }

    private buildWrappedUserStatus = async (req: ConnectorRequest): Promise<UserStatusWrapped> => {
        // Grab the user status data
        const userStatus = await this.buildUserStatus(req);

        return {
            md5: hash(userStatus, {algorithm: "md5"}),
            payload: userStatus,
            timestamp: Date.now(),
        };
    };

    private buildUserStatus = async (req: ConnectorRequest): Promise<UserStatus> => {

        // Fetch the refresh token expiration from the user's cookies
        const refreshTokenExpRaw = req.cookies?.[ConnectorCookies.REFRESH_TOKEN_EXPIRATION];

        // Ensure the refresh token is a number
        const refreshTokenExp = (!!refreshTokenExpRaw) ? parseInt(refreshTokenExpRaw) : null;

        // Build the basic user status
        const userStatus: UserStatus = {
            loggedIn: req.kccUserData?.isAuthenticated ?? false,
            userInfo: req.kccUserData?.userInfo,
            accessExpires: req.kccUserData?.accessToken?.exp ?? -1,
            refreshExpires: (refreshTokenExp && !isNaN(refreshTokenExp)) ? refreshTokenExp : -1,
        }

        // Decorate the connector with the user status
        if (req.kccUserData) {
            req.kccUserData.userStatus = userStatus;
        }

        // Grab additional decoration from plugins
        await this.authPluginManager.decorateUserStatus(req, userStatus);

        return userStatus;
    };

    private handleUserStatus = async (req: ConnectorRequest): Promise<ConnectorResponse<Server>> => {
        // Build user status with response
        const userStatus = await this.buildWrappedUserStatus(req);

        // Grab the cors headers
        const corsHeaders = this.getCorsHeaders(req);

        return {
            ...corsHeaders && {headers: corsHeaders},
            statusCode: 200,
            responseText: JSON.stringify(userStatus),
        };
    }

    private handleSilentLoginResponse = async (req: ConnectorRequest, cookies: CookieStore<Server>, event: SilentLoginEvent, sourceOrigin: string | undefined): Promise<ConnectorResponse<Server>> => {
        // Convert the cookies into an object based store
        const requestCookies = cookies.updatedReqCookies(req.cookies);

        // Manipulate the request with updated cookies
        req.cookies = {
            ...req.cookies,
            ...requestCookies,
        }

        // Force grab a new user data response
        const userDataResponse = await this.getUserData(req);

        // Downgrade success event if not authenticated after all
        if (event === SilentLoginEvent.LOGIN_SUCCESS) {
            if (!userDataResponse.userData.isAuthenticated) {
                event = SilentLoginEvent.LOGIN_REQUIRED;
            }
        }

        // Combine the resultant cookies (browser should accept newer cookies over old ones)
        if (userDataResponse.cookies) cookies.merge(userDataResponse.cookies);

        // Update request decorator
        req.kccUserData = userDataResponse.userData;

        // Wrap the user status data
        const userStatusWrapped = await this.buildWrappedUserStatus(req);

        // Get the silent type configuration
        const [silentRequestType] = this.silentRequestConfig(req);

        // Build the silent login response message
        const message: SilentLoginMessage = {
            event: event,
            data: userStatusWrapped,
        }

        return  {
            statusCode: 200,
            cookies: cookies,
            responseHtml: silentLoginResponseHTML(message,
                silentRequestType === SilentLoginTypes.PARTIAL,
                sourceOrigin ?? req.origin,
                process.env?.['DEBUG_SILENT_IFRAME'] !== undefined
            )
        }

    }

    private validateJwtOrThrow = async (jwt: string, type: VerifiableJwtTokenTypes): Promise<JWTVerifyResult> => {

        let authorizedParty = null;
        let audience: string|null = this._config.oidcClientMetadata.client_id;
        let requiredClaims: string[] = [];

        // Snapshot the time
        const currDate = new Date();

        // Calculate the default max age based on notBefore timestamp
        let maxAge: number|string|null = (this.components.notBefore) ? (epoch(currDate) - this.components.notBefore) : null;

        // Setup special configurations for each token type
        switch (type) {
            case VerifiableJwtTokenTypes.ID:
                requiredClaims = ['exp', 'sub'];
                break;

            case VerifiableJwtTokenTypes.LOGOUT:
                requiredClaims = ['sub'];

                // Override the max age. Logout messages from an OP should not come too late.
                maxAge = "10 minutes";
                break;

            // REMOVED: Cannot verify Keycloak signature token. KC uses symmetric algo (HS256). Left here if that changes in the future.
            // case JwtTokenTypes.REFRESH:
            //     requiredClaims = ['exp', 'sub', 'sid'];
            //
            //     // The audience should be the authorization server
            //     audience = this.components.oidcIssuer.metadata.issuer;
            //
            //     // Authorized party is this client
            //     authorizedParty = this._config.oidcClientMetadata.client_id;
            //     break;

            case VerifiableJwtTokenTypes.ACCESS:
                requiredClaims = ['exp', 'sub'];

                // No audience is set for access tokens
                audience = null;

                // Authorized party is this client
                authorizedParty = this._config.oidcClientMetadata.client_id;
                break;
        }

        // Verify the token
        const verifyResult = await jose.jwtVerify(jwt, this.components.remoteJWKS, {
            issuer: this.components.oidcIssuer.metadata.issuer,
            ...audience && {audience: audience},
            currentDate: currDate,
            ...maxAge && {maxTokenAge: maxAge},
            requiredClaims: requiredClaims,
        });

        // For access tokens, check if there is an audience that matches this client_id
        let accessTokenAudienceCheckPass = false;
        if (type === VerifiableJwtTokenTypes.ACCESS) {
            const audClaim = verifyResult.payload['aud'];
            const clientId = this._config.oidcClientMetadata.client_id;

            // Check if the audience claim is or includes the client id in the aud claim array
            if (audClaim === clientId ||
                (Array.isArray(audClaim) && clientId.includes(clientId))
            ) {
                // Allow this token to bypass the loose azp check
                accessTokenAudienceCheckPass = true;
            }
        }

        // Validate the typ declaration
        const jwtTyp = verifyResult.payload['typ'];
        if (jwtTyp !== type) {
            throw new Error(`Mismatch TYP claim, expected ${type}`);
        }

        // Validate azp declaration
        // Note - Based on OIDC Core 1.0 - draft 32 errata 2.0, we are encouraged not to use azp & ignore it when it does occur.
        //          The configuration below blends the requirement, verifying the azp if it exists otherwise ignoring it.
        const jwtAzp = verifyResult.payload['azp'];
        if (!accessTokenAudienceCheckPass && jwtAzp !== undefined && authorizedParty !== null && jwtAzp !== authorizedParty)  {
            throw new Error(`Mismatch AZP claim, expected ${this.components.oidcClient.metadata.client_id}`);
        }

        // Removed: IAT validated by jose already
        // // Validate IAT is not too early
        // const jwtIat = verifyResult.payload['iat'];
        // if (this.components.notBefore && (jwtIat === undefined || isNaN(jwtIat) || jwtIat < this.components.notBefore)) {
        //     throw new Error(`Invalid IAT claim. Claim is missing, not a number, or before "notBefore" time declared by OP`);
        // }

        return verifyResult;
    }

    public getUserData = async (connectorRequest: ConnectorRequest): Promise<UserDataResponse<Server>> => {

        // Todo: add the result of this call to the connector request with the key being the access token

        // Execute the following loop at most twice
        let numOfLoopExecutions = 0;

        let userInfo: UserinfoResponse | undefined;
        let userDataResponse: UserDataResponse<Server>;
        let userData: UserData;

        do {
            // Start with a user who has no data, no authentication
            userDataResponse = {
                userData: structuredClone(UserDataDefault),
            }

            // Extract the user data key
            userData = userDataResponse.userData;

            try {
                // Check the origin of the request
                this.validateOriginOrThrow(connectorRequest, false);
            } catch (e) {
                return userDataResponse;
            }

            // Grab the access token from the request
            const validatedAccessJwt = await this.populateTokensFromRequest(connectorRequest, userDataResponse, numOfLoopExecutions > 0);

            // Allow auth plugins to decorate the response with defaults
            await this.authPluginManager.decorateRequestDefaults(connectorRequest, userData);

            // Check for no access token
            if (userData.accessToken === undefined || validatedAccessJwt === undefined) return userDataResponse;

            // Skip handling grabbing user info if not required
            if (!this._config.fetchUserInfo) break;

            // Check if this route wants to verify user info
            if (connectorRequest.routeConfig.verifyUserInfoWithServer) {
                // Invalidate user info cache
                this._config.pinoLogger?.debug(`Route requires user info verification with server, invalidating cache matching JWT.`);
                await this.components.userInfoCache.invalidateFromJwt(validatedAccessJwt);
            }

            // Grab the user info
            userInfo = await this.components.userInfoCache.getUserInfo(validatedAccessJwt);

            // Check for user data
            if (userInfo !== undefined) {
                // Check if there is a custom transformation function to run
                if (typeof this._config.fetchUserInfo !== "boolean") {
                    userInfo = this._config.fetchUserInfo(userInfo);
                }

                // Save the results
                userDataResponse.userData.userInfo = userInfo;

                // Exit the while loop
                break;
            }

        } while(++numOfLoopExecutions < 2);

        // Add reference to user data on the connector request as well
        connectorRequest.kccUserData = userData;

        // Check for no user info data (still)
        if (this._config.fetchUserInfo && userInfo === undefined) {
            // Valid token, but not valid user info information. Could be a server error, but nevertheless, sync the responses and return no authentication
            this._config.pinoLogger?.error("User has a valid token, but no user info data returned from the OP.");
            return userDataResponse;
        }

        // User is authenticated since they have a valid access token
        userData.isAuthenticated = true;

        // Handle authorizing user based on request and user data
        userData.isAuthorized = await this.authPluginManager.isUserAuthorized(connectorRequest, userData);

        // Add user status information to the connector
        await this.buildUserStatus(connectorRequest);

        return userDataResponse;
    }

    public isUserAuthorized = async (connectorRequest: ConnectorRequest, userData: UserData): Promise<boolean> => {
        // Check if the page is public anyway OR is the page is protected, but there is no role requirement
        if (connectorRequest.routeConfig.public || (Array.isArray(connectorRequest.routeConfig.roles) && connectorRequest.routeConfig.roles.length === 0)) {
            return true;

        } else if (connectorRequest.routeConfig.roles) {

            // Check for missing access token
            if (userData.accessToken === undefined) return false;

            // Check for required roles
            return this.roleHelper.userHasRoles(connectorRequest.routeConfig.roles, userData.accessToken);

        }

        this._config.pinoLogger?.error("Invalid route configuration, must specify roles if route is not public.");
        throw new Error('Invalid route configuration, must specify roles if route is not public.');
    }

    /**
     * Gets an end-user's access token from the request and stores the validated version in the response, or,
     * if the access token is not valid, uses the refresh token to grab a new TokenSet, if possible.
     * @param connectorRequest
     * @param userDataResponse
     * @param forceValidateWithServer
     * @return string|undefined Returns the validated accessJwt
     * @private
     */
    private async populateTokensFromRequest(connectorRequest: ConnectorRequest, userDataResponse: UserDataResponse<Server>, forceValidateWithServer = false): Promise<string | undefined> {

        // Check the state configuration
        //todo: add support for stateful configurations

        // Handle stateless configuration
        const accessJwt = connectorRequest.cookies?.[ConnectorCookies.ACCESS_TOKEN];
        const refreshJwt = connectorRequest.cookies?.[ConnectorCookies.REFRESH_TOKEN];

        // Determine if we need to verify the access token with keycloak
        const validateAccessTokenWithServer =
            forceValidateWithServer ||
            this._config.alwaysVerifyAccessTokenWithServer ||
            connectorRequest.routeConfig.verifyAccessTokenWithServer;

        // Grab the access token
        const accessToken = await this.accessTokenFromJwt(accessJwt, validateAccessTokenWithServer);

        // Check for eager refresh
        let eagerRefresh = false;
        if (accessToken?.exp &&
            typeof this.config.eagerRefreshTime === "number" &&
            this.config.eagerRefreshTime > 0) {

            // Calculate the time until we need to perform an eager refresh
            const timeUntilEager = accessToken.exp - Date.now()/1000 - (this.config.eagerRefreshTime * 60);
            eagerRefresh = (timeUntilEager <= 0);
        }

        // Check for an access token
        if (accessToken && !eagerRefresh) {
            // Store access token in response
            userDataResponse.userData.accessToken = accessToken;

            // Return the validated access token
            return accessJwt;
        }

        // Remove previously attached access token
        delete userDataResponse.userData.accessToken;

        try {
            // Check for no refresh jwt
            if (refreshJwt === undefined) return;

            // Check for a read only server
            if (this._config.readOnlyServer) return;

            // Grab a new pair of tokens using the refresh token
            const refreshTokenSetResult = await this.refreshTokenSet(refreshJwt);

            // Check the refresh result
            if (refreshTokenSetResult === undefined) return;

            // Expand variables
            const {refreshTokenSet, shouldUpdateCookies} = refreshTokenSetResult;

            // Pass the new TokenSet to the handler and grab the resultant cookie(s)
            const cookies = this.validateAndHandleTokenSet(refreshTokenSet);

            // Store the access token in the response
            userDataResponse.userData.accessToken = refreshTokenSet.accessToken;

            // Record the token pair in the response cookies
            if (shouldUpdateCookies) {
                userDataResponse.cookies ??= this.cookieStoreGenerator();
                userDataResponse.cookies.merge(cookies);
            }

            // Return the validated access token
            return refreshTokenSetResult.refreshTokenSet.access_token;
        } catch (e) {
            if (isObject(e)) this._config.pinoLogger?.warn(e);
            this._config.pinoLogger?.warn(`Failed to get new TokenSet using refresh token`);
            return;
        }
    }

    /**
     * Returns the access token from the provided Jwt. Will return the new access token for a short-period to account
     * for network delays and queued requests on the end-user side.
     * @param accessJwt
     * @param validateAccessTokenWithServer
     * @private
     */
    private async accessTokenFromJwt(accessJwt?: string, validateAccessTokenWithServer?: boolean): Promise<JWTPayload|undefined> {

        // No access token
        if (accessJwt === undefined) return;

        try {

            // Validate and save the access token payload
            const jwtResult = await this.validateJwtOrThrow(accessJwt, VerifiableJwtTokenTypes.ACCESS);

            // Validate access token with keycloak server if required
            if (validateAccessTokenWithServer) {
                const introspectResult = await this.components.oidcClient.introspect(accessJwt, 'access_token');

                // Check result
                if (!introspectResult.active) {
                    // Log if only to detect attacks
                    this._config.pinoLogger?.warn(`Checked validated access token with server. Server says token is no longer active, not allowing use of access token`);
                    return undefined;
                }
            }

            // Return the access token in the user data response
            return jwtResult.payload;

        } catch (e) {
            // Log if only to detect attacks
            if (e instanceof jose.errors.JWTExpired) {
                this._config.pinoLogger?.warn('Expired access token used');
            } else if (e instanceof Error && e.message.includes(`unsupported`) && e.message.includes(`auth_method`)) {
                this._config.pinoLogger?.warn('Invalid access token used'); // This occurs when an access token is revoked auto/manually at OP
            } else {
                if (isObject(e)) this._config.pinoLogger?.warn(e);
                this._config.pinoLogger?.warn('Error validating access token');
            }
        }

        return undefined;
    }

    /**
     * Obtains a new TokenSet from the OP
     * @param refreshJwt
     * @private
     */
    private async refreshTokenSet(refreshJwt?: string): Promise<RefreshTokenSetResult|undefined> {

        // Check for missing refresh token
        if (refreshJwt === undefined) return undefined;

        try {
            // REMOVED: Cannot verify Keycloak signature token. KC uses symmetric algo (HS256). Left here if that changes in the future.
            // Validate the jwt
            // void await this.validateJwtOrThrow(refreshJwt, VerifiableJwtTokenTypes.REFRESH);

            // Perform refresh
            return await this.components.tokenCache.refreshTokenSet(refreshJwt);

        } catch (e) {
            if (isObject(e)) this._config.pinoLogger?.debug(e);
            this._config.pinoLogger?.debug(`Could not validate refresh token, could not perform refresh.`);
        }

        // Could not refresh
        return undefined;
    }

    private hasOtherOrigins = () => !!this._config.validOrigins?.length;

    /**
     * @throws OPError
     * @param tokenSet
     * @private
     */
    private validateAndHandleTokenSet(tokenSet: TokenSet | RefreshTokenSet): CookieStore<Server> {

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
            throw new OPError({error: "Missing required properties from OP"});
        }

        // Decode the refresh token to grab the expiration date
        const refreshTokenExpiration = jose.decodeJwt(tokenSet.refresh_token).exp ?? tokenSet.expires_at;

        // Collect the cookies we would like the server to send back
        const cookies = this.cookieStoreGenerator();

        // Store the access token
       cookies.add({
            name: ConnectorCookies.ACCESS_TOKEN,
            value: tokenSet.access_token,
            options: {
                ...(this.hasOtherOrigins()) ? this.CookieOptionsUnrestricted : this.CookieOptions,
                expires: new Date(tokenSet.expires_at * 1000),
            }
        });

        // Store the refresh token
       cookies.add({
            name: ConnectorCookies.REFRESH_TOKEN,
            value: tokenSet.refresh_token,
            options: {
                ...(this.hasOtherOrigins()) ? this.CookieOptionsUnrestricted : this.CookieOptions,
                expires: new Date(refreshTokenExpiration * 1000),
            }
        });

        // Store refresh token expiration date in a javascript accessible location
       cookies.add({
            name: ConnectorCookies.REFRESH_TOKEN_EXPIRATION,
            value: refreshTokenExpiration.toString(),
            options: {
                ...(this.hasOtherOrigins()) ? this.CookieOptionsUnrestricted : this.CookieOptions,
                expires: new Date(refreshTokenExpiration * 1000),
            }
        });

        // Store the id token
       cookies.add({
            name: ConnectorCookies.ID_TOKEN,
            value: tokenSet.id_token,
            options: {
                ...(this.hasOtherOrigins()) ? this.CookieOptionsUnrestricted : this.CookieOptions,
                expires: new Date(refreshTokenExpiration * 1000), // Intentionally use refresh token expiration
            }
        });

        return cookies;
    }

    public buildRouteProtectionResponse = async (connectorRequest: ConnectorRequest, userData: UserData): Promise<ConnectorResponse<Server> | undefined> => {

        // Return immediately if the route is public or the user is authorized
        if (connectorRequest.routeConfig.public || userData.isAuthorized) return;

        // Check if unauthenticated
        if (!userData.isAuthenticated) {

            // Auto-show login page
            if (connectorRequest.routeConfig.autoRedirect !== false && connectorRequest.headers['sec-fetch-mode'] === 'navigate') {
                return await this.handleLoginGet(connectorRequest);
            }

            // Member is unauthenticated
            return this.config.errorResponseHandler?.(401) ?? {
                statusCode: 401,
                responseText: 'unauthenticated',
            }
        }

        // Member is not authorized
        return this.config.errorResponseHandler?.(403) ?? {
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

                // Update the remote JWT set function
                this.components.remoteJWKS = KeycloakConnector.createRemoteJWTSet(this.components.oidcConfig.jwks_uri);

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
                } = await KeycloakConnector.createOidcClients(
                    this.components.oidcConfig,
                    this._config.oidcClientMetadata,
                    this.components.connectorKeys.privateJwk,
                    this._config.DANGEROUS_disableJwtClientAuthentication
                ));

                this._config.pinoLogger?.debug(`OIDC update complete`);
                return true;

            } catch (e) {
                if (isObject(e)) this._config.pinoLogger?.error(e);
                this._config.pinoLogger?.error(`Failed to update OIDC configuration`);
                return false;
            } finally {
                // Clear the active update promise
                this.updateOidcConfig = null;
            }
        })();

        // Await the function call
        return await this.updateOidcConfig;
    }

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
            fetchUserInfo: true,
            DANGEROUS_disableJwtClientAuthentication: (process.env?.['DANGEROUS_KC_DISABLE_JWT_CLIENT_AUTHENTICATION'] === "true"),
            eagerRefreshTime: 5,

            // Consumer provided configuration
            ...customConfig,

            oidcClientMetadata: {
                // Hotfix -- Keycloak is improperly handling userinfo endpoint requests
                // See -- https://github.com/keycloak/keycloak/issues/20185
                userinfo_signed_response_alg: KeycloakConnector.REQUIRED_ALGO,

                //ref: https://github.com/panva/node-openid-client/blob/main/docs/README.md#new-clientmetadata-jwks-options
                //ref: https://openid.net/specs/openid-connect-registration-1_0.html

                client_id: customConfig.clientId ?? process.env?.['KC_CLIENT_ID'] ?? EMPTY_STRING,
                client_secret: customConfig.clientSecret ?? process.env?.['KC_CLIENT_SECRET'] ?? EMPTY_STRING,
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
                // Removed auth methods, defaults to above setting
                // introspection_endpoint_auth_method: 'private_key_jwt',
                // revocation_endpoint_auth_method: 'private_key_jwt',
                id_token_signed_response_alg: KeycloakConnector.REQUIRED_ALGO,
                authorization_signed_response_alg: KeycloakConnector.REQUIRED_ALGO,
                token_endpoint_auth_signing_alg: KeycloakConnector.REQUIRED_ALGO,
                request_object_signing_alg: KeycloakConnector.REQUIRED_ALGO,
                introspection_endpoint_auth_signing_alg: KeycloakConnector.REQUIRED_ALGO,
                revocation_endpoint_auth_signing_alg: KeycloakConnector.REQUIRED_ALGO,
            }
        }

        // Manipulate pino logger to embed a _prefix into each message
        if (config.pinoLogger) config.pinoLogger = config.pinoLogger.child({"Source": "KeycloakConnector"});

        // Check if disabling jwt authentication
        const missingClientSecret = config.oidcClientMetadata.client_secret === undefined || config.oidcClientMetadata.client_secret === EMPTY_STRING;
        if (config.DANGEROUS_disableJwtClientAuthentication) {
            // Update the config to disable jwt auth
            config.oidcClientMetadata.token_endpoint_auth_method = 'client_secret_post';

            // Check if there is a missing client secret when we need one
            if (missingClientSecret) throw new Error(`Client secret not specified or environment variable "KC_CLIENT_SECRET" not found`);

        } else if (!missingClientSecret) {
            throw new Error(`"Client secret" has no purpose with JWT client authentication enabled (production default). Keycloak Connector WILL NOT start until removed.`);
        }

        // Check for invalid client metadata
        if (config.oidcClientMetadata.client_id === EMPTY_STRING) throw new Error(`Client ID not specified or environment variable "KC_CLIENT_ID" not found`);
        if (config.oidcClientMetadata.redirect_uris === undefined || config.oidcClientMetadata.redirect_uris.length === 0)  throw new Error(`No login redirect URIs specified`);
        if (config.oidcClientMetadata.post_logout_redirect_uris === undefined || config.oidcClientMetadata.post_logout_redirect_uris.length === 0)  throw new Error(`No post logout redirect URIs specified`);

        // Check for the dangerous condition
        if (config.DANGEROUS_disableJwtClientAuthentication) {
            config.pinoLogger?.warn(`DANGEROUS_disableJwtClientAuthentication is enabled, DO NOT USE THIS SETTING IN PRODUCTION`);

            // Check if this is production (not guaranteed to catch, but as a last chance catch)
            if (process.env?.['NODE_ENV'] === "production" && process.env?.["DANGEROUS__DO_NOT_USE_UNLESS_YOU_KNOW_WHAT_YOU_ARE_DOING"] !== "BYPASS_PRODUCTION_AUTH_PROTECTION") {
                throw new Error(`DANGEROUS_disableJwtClientAuthentication is set to "true" in production. Keycloak client WILL NOT start in this configuration for your safety.`);
            }
        }

        // Check for a read only server
        if (config.validateAccessOnly) config.readOnlyServer ??= config.validateAccessOnly;

        // Disable eager refresh if the server is read only
        if (config.readOnlyServer) config.eagerRefreshTime = false;

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
        const keyProvider = await (config.keyProvider ?? standaloneKeyProvider)(keyProviderConfig);
        const connectorKeys = await keyProvider.getActiveKeys();

        // Grab the oidc clients
        const oidcClients = await KeycloakConnector.createOidcClients(
            openIdConfig,
            config.oidcClientMetadata,
            connectorKeys.privateJwk,
            config.DANGEROUS_disableJwtClientAuthentication
        );

        // Ensure we have a JWKS uri
        if (oidcClients.oidcIssuer.metadata.jwks_uri === undefined) {
            throw new Error('Authorization server provided no JWKS_URI, cannot find public keys to verify tokens against');
        }

        // Store the OP JWK set
        const remoteJWKS = KeycloakConnector.createRemoteJWTSet(oidcClients.oidcIssuer.metadata.jwks_uri);

        // Prepare the caches
        const cacheOptions = {
            ...config.pinoLogger && {pinoLogger: config.pinoLogger},
            ...config.clusterProvider && {clusterProvider: config.clusterProvider},
            oidcClient: oidcClients.oidcClient,
        };

        // Initialize the token cache
        const tokenCache = new TokenCache(cacheOptions);

        // Initialize the user info cache
        const userInfoCache = new UserInfoCache(cacheOptions);

        const components: KeycloakConnectorInternalConfiguration = {
            oidcDiscoveryUrl: oidcDiscoveryUrl,
            oidcConfig: openIdConfig,
            keyProvider: keyProvider,
            tokenCache: tokenCache,
            userInfoCache: userInfoCache,
            ...oidcClients,
            remoteJWKS: remoteJWKS,
            connectorKeys: connectorKeys,
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

    private static async createOidcClients(
        newOidcConfig: IssuerMetadata,
        oidcClientMetadata: ClientMetadata,
        privateJwk: JWK,
        DANGEROUS_disableJwtClientAuthentication: boolean = false
    ) {

        // Initialize Issuer with the new config
        const oidcIssuer = new Issuer(newOidcConfig);

        // Determine the client to use
        const clientConstructor = DANGEROUS_disableJwtClientAuthentication ? oidcIssuer.Client : oidcIssuer.FAPI1Client;

        // Initialize the new Client
        const oidcClient = new clientConstructor(oidcClientMetadata, {keys: [privateJwk]});

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
            config.pinoLogger?.info(`Fetching oidc configuration from ${oidcDiscoveryUrl}`);

            // Fetch latest openid-config data
            const result = await fetch(oidcDiscoveryUrl, {signal: AbortSignal.timeout(60000)});

            // Check for an incorrect status code
            if (result.status !== 200) {
                config.pinoLogger?.warn(`Could not fetch openid-configuration, unexpected response from auth server: ${result.status}`);
                return null;
            }

            // Grab the json value
            return Object.freeze(await result.json()) as IssuerMetadata;

        } catch (e) {
            // Log the error
            if (isObject(e)) config.pinoLogger?.warn(e);
            if (isObject(e)) config.pinoLogger?.warn(`Failed to fetch latest openid-config data`);
            return null;
        }
    }

    private getRoutePath = (route: RouteEnum): string => {
        return getRoutePath(route, this._config.routePaths);
    }

    private getRouteUri = (route: RouteEnum): string => {
        return KeycloakConnector.getRouteUri(route, this._config);
    }

    static getRouteUri(route: RouteEnum, config: KeycloakConnectorConfigCustom | KeycloakConnectorConfigBase) {
        return config.serverOrigin + getRoutePath(route, config.routePaths);
    }

    get oidcConfig(): IssuerMetadata | null {
        return this.components.oidcConfig;
    }

    get config(): KeycloakConnectorConfigBase {
        return this._config;
    }
}
