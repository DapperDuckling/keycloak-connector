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
    SilentLogoutTypes,
    URL, deferredFactory, type Deferred,
} from "@dapperduckling/keycloak-connector-common";
import {setImmediate} from "./utils.js";
import JsCookie from "js-cookie";
import {silentLoginIframeHTML} from "./silent-login-iframe.js";
import {is, validate} from "typia";
import {type ClientConfig, ClientEvent, LocalStorage} from "./types.js";
import {EventListener} from "@dapperduckling/keycloak-connector-common";

export class KeycloakConnectorClient {
    // Create a random token if in a secure context. If not in a secure context, just generate a non-cryptographically secure "random" token
    // Dev note: This is merely a defense-in-depth approach that is paired with origin checking anyway. If this app is running in an unsecure
    //            context already, the user has already lost to a MITM attack.
    private token = self.isSecureContext
        ? self.crypto.randomUUID()
        : Math.floor(Math.random() * 100_000).toString();


    private userStatusHash: string | undefined = undefined;
    // private eventTarget = new EventTarget();
    private eventListener = new EventListener<ClientEvent>();

    private config: ClientConfig;
    private acceptableOrigins: string[];
    private loginListenerAwake = false;
    private loginListenerInitiated: number | undefined = undefined;
    private userStatusAbortController: AbortController | undefined = undefined;
    private started = false;
    private isAuthCheckedWithServer = false;
    private isAuthChecking = false;

    private static kccClient: KeycloakConnectorClient | undefined = undefined;
    private static readonly IFRAME_ID = "silent-login-iframe";
    private static readonly LISTENER_IFRAME_ID = "listener-login-iframe";
    private static readonly ENABLE_IFRAME_DEBUGGING = process?.env?.["DEBUG_SILENT_IFRAME"] !== undefined;
    private static readonly MAX_LOGIN_LISTENER_WAIT_SECS = 30;


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
        // Check to see if the client is already started
        if (this.started) {
            this.config.logger?.error(`Already started, cannot start again`);
        }

        // Set the auth to happen on the next tick
        setImmediate(async () => {
            await this.authCheck();
        });

        // Set the started flag
        this.started = true;
    }

    public isStarted = () => this.started;

    public addEventListener = (...args: Parameters<EventListener<ClientEvent>['addEventListener']>) => this.eventListener.addEventListener(...args);
    public removeEventListener = (...args: Parameters<EventListener<ClientEvent>['removeEventListener']>) => this.eventListener.removeEventListener(...args);

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
            case SilentLoginEvent.LOGIN_LISTENER_ALIVE:
                this.loginListenerAwake = true;
                break;
            case SilentLoginEvent.LOGIN_REQUIRED:
            case SilentLoginEvent.LOGIN_SUCCESS:

                // Update the auth checked with server flag
                this.isAuthCheckedWithServer = true;

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

                // // Check for a valid token at this point
                // if (KeycloakConnectorClient.isTokenCurrent(TokenType.ACCESS)) return;

                // Send the login error event
                this.eventListener.dispatchEvent(ClientEvent.LOGIN_ERROR);
        }
    }

    private silentLogin = () => {
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
            "allow-scripts allow-same-origin allow-forms"
        );
        iframe.style.display = "none";

        // Mount the iframe
        document.body.appendChild(iframe);
    }

    private silentLoginListener = () => {

        // Check if the listener is already up
        if (this.loginListenerAwake) return;

        // Check if the previous login listener is still initiating
        if (this.loginListenerInitiated !== undefined &&
            this.loginListenerInitiated + KeycloakConnectorClient.MAX_LOGIN_LISTENER_WAIT_SECS * 1000 > Date.now()) return;

        // Remove any existing login listener iframe
        this.removeListenerIframe();

        // Check for an existing silent listener
        if (document.querySelectorAll(`#${KeycloakConnectorClient.LISTENER_IFRAME_ID}`).length > 0) return;

        // Make an iframe to listen for successful authentications
        const iframe = document.createElement("iframe");
        const listenerUrl = `${this.config.apiServerOrigin}${getRoutePath(RouteEnum.LOGIN_LISTENER, this.config.routePaths)}?source-origin=${self.origin}&silent-token=${this.token}`;
        iframe.id = KeycloakConnectorClient.LISTENER_IFRAME_ID;
        iframe.src = listenerUrl;
        iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin"
        );
        iframe.style.display = "none";

        // Mount the iframe
        document.body.appendChild(iframe);

        // Store the initiated time
        this.loginListenerAwake = false;
        this.loginListenerInitiated = Date.now();
    }

    private abortBackgroundLogins = () => {
        this.isAuthChecking = false;
        this.userStatusAbortController?.abort();
        this.removeSilentIframe();
    }

    private removeSilentIframe = () => document.querySelectorAll(`#${KeycloakConnectorClient.IFRAME_ID}`).forEach(elem => elem.remove());
    private removeListenerIframe = () => document.querySelectorAll(`#${KeycloakConnectorClient.LISTENER_IFRAME_ID}`).forEach(elem => elem.remove());

    private authCheckNoWait = () => {
        // Check for a valid access token
        if (KeycloakConnectorClient.isTokenCurrent(TokenType.ACCESS)) {
            // Initial check if the user status has not been populated
            if (this.userStatusHash === undefined && this.config.fastInitialAuthCheck) {
                this.handleUpdatedUserStatus();
            }

            return true;
        }

        // Check for a valid refresh token
        const validRefreshToken = KeycloakConnectorClient.isTokenCurrent(TokenType.REFRESH);

        // Check for an invalid refresh token as well
        if (!validRefreshToken) {
            // Send an invalid tokens event
            this.eventListener.dispatchEvent(ClientEvent.INVALID_TOKENS);
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
        if (this.authCheckNoWait() && (this.userStatusHash !== undefined || this.config.fastInitialAuthCheck)) return;

        // Prevent multiple async auth checks from occurring
        if (this.isAuthChecking) {
            console.debug(`Is already auth checking, will not make another attempt`);
        }

        // Set the flag
        this.isAuthChecking = true;

        // Dispatch the start silent login event
        this.eventListener.dispatchEvent(ClientEvent.START_SILENT_LOGIN);

        // Attempt to update the auth with the refresh token
        if (await this.refreshAccessWithRefresh()) {
            this.isAuthChecking = false;
            this.isAuthCheckedWithServer = true;
            return;
        }

        // Attempt to reauthenticate silently
        this.silentLogin();
    }

    private handleOnFocus = () => {
        this.authCheckNoWait();
    }

    private static getStoredUserStatusWrapped = () => {
        // Grab the user status from local storage
        const userStatusWrapped = JSON.parse(
            localStorage.getItem(LocalStorage.USER_STATUS) ?? "{}"
        );

        // Check the resultant object for the proper type
        return is<UserStatusWrapped>(userStatusWrapped) ? userStatusWrapped : undefined;
    }

    private handleUpdatedUserStatus = () => {

        // Grab the user status from local storage
        const userStatusWrapped = KeycloakConnectorClient.getStoredUserStatusWrapped();

        // Check for no result
        if (userStatusWrapped === undefined) return;

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

        this.eventListener.dispatchEvent<UserStatus>(ClientEvent.USER_STATUS_UPDATED, userStatus);
    }

    private handleStorageEvent = (event: StorageEvent) => {
        // Check for the user data update
        if (event.key !== LocalStorage.USER_STATUS) return;

        // Call helper function to handle any changes to the status
        this.handleUpdatedUserStatus();

        // Update the auth checked with server flag
        // (Storage events from other clients are the result of network calls)
        this.isAuthCheckedWithServer = true;
    }

    /**
     * Prepares the client to smoothly handle logins through a new window
     */
    prepareToHandleNewWindowLogin = () => this.silentLoginListener();

    handleLogin = async (newWindow?: boolean) => {

        // Abort the background logins
        this.abortBackgroundLogins();

        // Build the login url
        let loginUrl = `${this.config.apiServerOrigin}${getRoutePath(RouteEnum.LOGIN_POST, this.config.routePaths)}?post_auth_redirect_uri=${self.location.href}`;

        // Check for a new window request
        if (newWindow) {
            // Check if the silent login listener was not initiated
            if (this.loginListenerInitiated === undefined) {
                console.error(`Unable to smoothly handle new window login. Need to call prepareToHandleNewWindowLogin() before calling this function.`);
            }

            // Check if the listener is awake
            if (this.loginListenerAwake) {
                loginUrl += `&silent=${SilentLoginTypes.PARTIAL}&silent-token=${this.token}`;
            } else {
                console.warn('Silent login listener not yet ready, skipping smooth background handling');
            }
        }

        // Form Settings
        const form = document.createElement("form");
        form.method = "POST";
        form.action = loginUrl;
        form.target = (newWindow === true) ? "_blank" : "_self";
        form.rel = "opener";
        document.body.appendChild(form);
        form.submit();

        // Delete the new form
        document.body.removeChild(form);
    }

    handleLogout = async () => {
        // Build the logout url
        const logoutUrl = `${this.config.apiServerOrigin}${getRoutePath(RouteEnum.LOGOUT_POST, this.config.routePaths)}?post_auth_redirect_uri=${self.location.href}`;

        try {
            // Attempt to log out using a fetch
            const logoutFetch = await fetch(`${logoutUrl}?silent=${SilentLogoutTypes.FETCH}`, {
                credentials: "include",
                method: "POST",
            });

            // Grab the result
            const result = await logoutFetch.json();

            // Ensure we received the expected response
            if (is<GeneralResponse>(result)) {
                // Check for a valid logout result
                if (result.success) {
                    // Send a logout event
                    this.eventListener.dispatchEvent(ClientEvent.LOGOUT_SUCCESS);
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

        // Grab the user status from local storage
        const userStatusWrapped = KeycloakConnectorClient.getStoredUserStatusWrapped();

        // Check for no result
        if (userStatusWrapped === undefined) return;

        let expirationTimestamp;

        switch (type) {
            case TokenType.ACCESS:
                expirationTimestamp = userStatusWrapped.payload.accessExpires;
                break;
            case TokenType.REFRESH:
                expirationTimestamp = userStatusWrapped.payload.refreshExpires;
                break;
            default:
                throw new Error("Invalid token type");
        }

        // Check for an invalid number
        if (Number.isNaN(expirationTimestamp)) return false;

        return (Date.now() < expirationTimestamp * 1000);
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

        //todo: Get typia working
        // // Ensure the config is valid
        // const configValidation = validate<ClientConfig>(config);
        // if (!configValidation.success) {
        //     console.error(configValidation.errors);
        //     throw new Error("Invalid config provided to KeycloakConnectorClient. See console for more details.");
        // }

        // Initiate the singleton
        this.kccClient = new KeycloakConnectorClient(config);

        // Return the client
        return this.kccClient;
    }
}

export const keycloakConnectorClient = (config: ClientConfig) => KeycloakConnectorClient.instance(config);
