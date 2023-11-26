import {
    ConnectorCookies,
    getRoutePath,
    RouteEnum,
    SilentLoginEvent,
    type SilentLoginMessage,
    TokenType,
    type UserStatus,
    type UserStatusWrapped,
    type GeneralResponse,
    SilentLoginTypes,
    SilentLogoutTypes
} from "@dapperduckling/keycloak-connector-common";
import {setImmediate} from "./utils.js";
import JsCookie from "js-cookie";
import {silentLoginIframeHTML} from "./silent-login-iframe.js";
import {is, validate} from "typia";
import {type ClientConfig, ClientEvent, LocalStorage} from "./types.js";

export class KeycloakConnectorClient {
    // Create a random token if in a secure context. If not in a secure context, just generate a non-cryptographically secure "random" token
    // Dev note: This is merely a defense-in-depth approach that is paired with origin checking anyway. If this app is running in an unsecure
    //            context already, the user has already lost to a MITM attack.
    private token = self.isSecureContext
        ? self.crypto.randomUUID()
        : Math.floor(Math.random() * 100_000).toString();


    private userStatusHash: string | undefined = undefined;
    private eventTarget = new EventTarget();
    private config: ClientConfig;
    private acceptableOrigins: string[];
    private userStatusAbortController: AbortController | undefined = undefined;
    private isAuthChecking = false;
    private started = false;

    private static kccClient: KeycloakConnectorClient | undefined = undefined;
    private static readonly IFRAME_ID = "silent-login-iframe";
    private static readonly ENABLE_IFRAME_DEBUGGING = process?.env?.["DEBUG_SILENT_IFRAME"] !== undefined;

    private constructor(config: ClientConfig) {
        // Store the config
        this.config = config;

        // Update the logger reference
        if (this.config.logger) {
            this.config.logger = this.config.logger.child({"Source": "KeycloakConnectorClient"})
        }

        // Build the list of acceptable origins
        this.acceptableOrigins = [self.origin];

        // Validate the api server origin input
        if (config.apiServerOrigin !== undefined) {
            // Check for a valid URL
            if (!URL.canParse(config.apiServerOrigin)) {
                throw new Error("Invalid apiServerOrigin specified, cannot parse with `URL`");
            }

            // Calculate the origin from the provided "origin"
            const calculatedOrigin = new URL(config.apiServerOrigin).origin;

            // Check if the api server origin is an actual origin
            if (new URL(config.apiServerOrigin).origin !== config.apiServerOrigin) {
                throw new Error(`Invalid apiServerOrigin specified, calculated origin ${calculatedOrigin} does not match input ${config.apiServerOrigin}.`);
            }

            // Add the api server origin to the acceptable origins
            this.acceptableOrigins.push(config.apiServerOrigin);
        }

        // Listen for events from the storage api
        window.addEventListener("storage", this.handleStorageEvent);

        // Setup an on window focus listener
        window.addEventListener("focus", this.handleOnFocus);

        // Setup the silent login message listener
        window.addEventListener("message", this.handleWindowMessage);
    }

    public start = () => {
        if (this.started) {
            this.config.logger?.error(`Already started, cannot start again`);
        }

        // Set the auth to happen on the next tick
        setImmediate(this.authCheck);
    }

    public addEventListener = (...args: Parameters<EventTarget['addEventListener']>) => this.eventTarget.addEventListener(...args);
    public removeEventListener = (...args: Parameters<EventTarget['removeEventListener']>) => this.eventTarget.removeEventListener(...args);

    private storeUserStatus = (data: UserStatusWrapped | undefined) => {
        try {
            if (data === undefined) return;

            // Grab the existing user status from local storage
            const existingUserStatus = JSON.parse(
                localStorage.getItem(LocalStorage.USER_STATUS) ?? "{}"
            );

            // Don't update the local storage if this data has the same checksum or is older
            // const hasDifferentHash = existingUserStatus["md5"] === undefined || existingUserStatus["md5"] !== data.md5;
            const isMoreRecentData =
                existingUserStatus["timestamp"] === undefined ||
                existingUserStatus["timestamp"] < data.timestamp;
            if (isMoreRecentData) {
                // Store the new user status in local storage
                localStorage.setItem(LocalStorage.USER_STATUS, JSON.stringify(data));

                // Call the local storage update for this instance
                this.handleUpdatedUserStatus();
            }
        } catch (e) {
            this.config.logger?.error(`Could not update localStorage with user data`);
            this.config.logger?.error(e);
        }
    }

    private handleWindowMessage = (event: MessageEvent<SilentLoginMessage>) => {

        // Ignore message not from our an allowed origin or does not have the correct token
        if (!this.acceptableOrigins.includes(event.origin) || event.data.token !== this.token) return;

        // Extract the silent login message
        const silentLoginMessage = event.data;
        this.config.logger?.debug(`KCC Parent received: ${silentLoginMessage.event}`);

        // Handle the message
        switch (silentLoginMessage.event) {
            case SilentLoginEvent.CHILD_ALIVE:
                // NO-OP
                break;
            case SilentLoginEvent.LOGIN_REQUIRED:
            case SilentLoginEvent.LOGIN_SUCCESS:
                // Update the user status and interface
                this.storeUserStatus(silentLoginMessage.data);

                // Remove the iframe
                this.removeSilentIframe();

                // Reset the auth check flag
                this.isAuthChecking = false;
                break;
            case SilentLoginEvent.LOGIN_ERROR:
            default:
                // Remove the iframe
                this.removeSilentIframe();

                // Reset the auth check flag
                this.isAuthChecking = false;

                // Check for a valid token at this point
                if (KeycloakConnectorClient.isTokenCurrent(TokenType.ACCESS)) return;

                // Send the login error event
                this.eventTarget.dispatchEvent(new Event(ClientEvent.LOGIN_ERROR));
        }
    }

    private silentLogin = () => {

        // Dispatch the start silent login event
        this.eventTarget.dispatchEvent(new Event(ClientEvent.START_SILENT_LOGIN));

        // Make an iframe to make auth request
        const iframe = document.createElement("iframe");
        const authUrl = `${this.config.apiServerOrigin}${getRoutePath(RouteEnum.LOGIN_POST, this.config.routePaths)}?silent=${SilentLoginTypes.FULL}&silent-token=${this.token}`;
        iframe.id = KeycloakConnectorClient.IFRAME_ID;
        iframe.setAttribute(
            "srcDoc",
            silentLoginIframeHTML(
                authUrl,
                this.token,
                KeycloakConnectorClient.ENABLE_IFRAME_DEBUGGING
            )
        );
        iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms" //todo: may need to remove allow-same-origin here
        );
        iframe.style.display = "none";

        // Mount the iframe
        document.body.appendChild(iframe);
    }

    private abortBackgroundLogins = () => {
        this.isAuthChecking = false;
        this.userStatusAbortController?.abort();
        this.removeSilentIframe();
    }

    private removeSilentIframe = () => document.getElementById(KeycloakConnectorClient.IFRAME_ID)?.remove();

    private authCheckNoWait = () => {
        // Check for a valid access token
        if (KeycloakConnectorClient.isTokenCurrent(TokenType.ACCESS)) return true;

        // Check for a valid refresh token
        const validRefreshToken = KeycloakConnectorClient.isTokenCurrent(TokenType.REFRESH);

        // Check for an invalid refresh token as well
        if (!validRefreshToken) {
            // Send an invalid tokens event
            this.eventTarget.dispatchEvent(new Event(ClientEvent.INVALID_TOKENS));
        }

        return false;
    }

    private refreshAccessWithRefresh = async () => {
        // Check for a valid refresh token
        const validRefreshToken = KeycloakConnectorClient.isTokenCurrent(TokenType.REFRESH);

        // With a valid refresh token, attempt to update
        if (!validRefreshToken) return false;

        // Create a new abort controller
        this.userStatusAbortController = new AbortController();

        try {
            // Make a request to the user-status page in order to update the token
            const userStatusUrl = `${this.config.apiServerOrigin}${getRoutePath(RouteEnum.USER_STATUS, this.config.routePaths)}`;

            // Attempt to log out using a fetch
            const userStatusFetch = await fetch(`${userStatusUrl}`, {
                credentials: "include",
                signal: this.userStatusAbortController.signal,
            });

            // Clear the abort controller
            this.userStatusAbortController = undefined;

            // Grab the result
            const userStatusWrapped = await userStatusFetch.json();

            // Check for a message we were not expecting
            if (!is<UserStatusWrapped>(userStatusWrapped)) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error(`Invalid response from server`);
            }

            // Checked for not logged in
            if (!userStatusWrapped.payload.loggedIn) return false;

            // Update the user status
            this.storeUserStatus(userStatusWrapped);

            return true;

        } catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError')) {
                // Log the error
                this.config.logger?.error(`Failed to refresh access token in the background`);
                this.config.logger?.error(e);
            }
        }

        return false;
    }

    private authCheck = async () => {

        // Execute the synchronous auth check portion
        if (this.authCheckNoWait()) return;

        // Prevent multiple async auth checks from occurring
        if (this.isAuthChecking) return;

        // Set the flag
        this.isAuthChecking = true;

        // Attempt to update the auth with the refresh token
        if (await this.refreshAccessWithRefresh()) {
            this.isAuthChecking = false;
            return;
        }

        // Attempt to reauthenticate silently
        this.silentLogin();
    }

    private handleOnFocus = () => {
        this.authCheckNoWait();
    }

    private handleUpdatedUserStatus = () => {
        // Grab the user status from local storage
        const userStatusWrapped = JSON.parse(
            localStorage.getItem(LocalStorage.USER_STATUS) ?? "{}"
        );

        // Check the resultant object for the proper type
        if (!is<UserStatusWrapped>(userStatusWrapped)) return;

        // Cancel any background requests
        this.abortBackgroundLogins();

        // Check to see if the hash is not different
        if (this.userStatusHash === userStatusWrapped["md5"]) return;

        // Grab the user status payload
        const userStatus = userStatusWrapped["payload"];

        // Check for a missing payload
        if (userStatus === undefined) return;

        // Update the user status hash
        this.userStatusHash = userStatusWrapped["md5"];

        this.eventTarget.dispatchEvent(new CustomEvent<UserStatus<any>>(ClientEvent.USER_STATUS_UPDATED, {
            detail: userStatus
        }));
    }

    private handleStorageEvent = (event: StorageEvent) => {
        // Check for the user data update
        if (event.key !== LocalStorage.USER_STATUS) return;

        // Call helper function to handle any changes to the status
        this.handleUpdatedUserStatus();
    }

    handleLogin = (newWindow?: boolean) => {

        // Build the login url
        const loginUrl = `${this.config.apiServerOrigin}${getRoutePath(RouteEnum.LOGIN_POST, this.config.routePaths)}?post_auth_redirect_uri=${self.location.href}`;

        // Form Settings
        const form = document.createElement("form");
        form.method = "POST";
        form.action = loginUrl;
        form.target = (newWindow === true) ? "_blank" : "_self";
        document.body.appendChild(form);
        form.submit();

        // Delete the new form
        document.body.removeChild(form);
    }

    handleLogout = async () => {

        // Build the logout url
        const logoutUrl = `${this.config.apiServerOrigin}${getRoutePath(RouteEnum.LOGOUT_POST, this.config.routePaths)}`;

        try {
            // Attempt to log out using a fetch
            const logoutFetch = await fetch(`${logoutUrl}?silent=${SilentLogoutTypes.FETCH}`, {
                credentials: "include",
            });

            // Grab the result
            const result = await logoutFetch.json();

            // Ensure we received the expected response
            if (is<GeneralResponse>(result)) {
                // Check for a valid logout result
                if (result.success) {
                    // Send a logout event
                    this.eventTarget.dispatchEvent(new Event(ClientEvent.LOGOUT_SUCCESS));
                    return;
                }

                // noinspection ExceptionCaughtLocallyJS
                throw new Error(result.error);
            }

            // noinspection ExceptionCaughtLocallyJS
            throw new Error(`Invalid response from server`);

        } catch (e) {
            // Log the error
            this.config.logger?.error(`Failed to logout in the background`);
            this.config.logger?.error(e);
        }

        // Perform a form submit redirect to logout instead
        const form = document.createElement("form");
        form.method = "post";
        form.action = logoutUrl;

        // Append the form to the body
        document.body.appendChild(form);

        // Submit the form
        form.submit();

        // Remove the form from the body after submission
        document.body.removeChild(form);
    }

    static isTokenCurrent = (type: TokenType) => {
        let target;
        switch (type) {
            case TokenType.ACCESS:
                target = ConnectorCookies.PUBLIC_ACCESS_TOKEN_EXPIRATION;
                break;
            case TokenType.REFRESH:
                target = ConnectorCookies.REFRESH_TOKEN_EXPIRATION;
                break;
            default:
                throw new Error("Invalid token type");
        }

        const expirationTimestamp = Number.parseInt(JsCookie.get(target) ?? "0");

        // Check for an invalid number
        if (Number.isNaN(expirationTimestamp)) return false;

        return (Date.now() < expirationTimestamp);
    }

    static instance = (config: ClientConfig): KeycloakConnectorClient => {
        // Check if the client has already been instantiated
        if (this.kccClient) {
            // Ensure the config hasn't changed
            if (this.kccClient.config !== config) {
                throw new Error("KeycloakConnectorClient already instantiated, cannot re-instantiate with a different config.");
            }

            // Return the existing client
            return this.kccClient;
        }

        // Ensure the config is valid
        const configValidation = validate<ClientConfig>(config);
        if (!configValidation.success) {
            console.error(configValidation.errors);
            throw new Error("Invalid config provided to KeycloakConnectorClient. See console for more details.");
        }

        // Initiate the singleton
        this.kccClient = new KeycloakConnectorClient(config);

        // Return the client
        return this.kccClient;
    }
}

export const keycloakConnectorClient = (config: ClientConfig) => KeycloakConnectorClient.instance(config);
