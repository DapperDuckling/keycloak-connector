import {
    ConnectorCookies,
    Cookies,
    isDev,
    SilentLoginEvent,
    type SilentLoginMessage,
    TokenType,
    type UserStatusWrapped
} from "@dapperduckling/keycloak-connector-common";
import {setImmediate} from "./utils";
import JsCookie from "js-cookie";
import {silentLoginIframeHTML} from "./silent-login-iframe.js";
import {is} from "typia";

const STORAGE_SECURE_PREFIX = isDev() ? "__DEV_ONLY__" : "__Host__";
const STORAGE_KCC_PREFIX = "kcc-";
const STORAGE_PREFIX_COMBINED = `${STORAGE_SECURE_PREFIX}${STORAGE_KCC_PREFIX}`;

export const LocalStorage = Object.freeze({
    USER_STATUS: `${STORAGE_PREFIX_COMBINED}user-status`,
});

export class KCClient {
    private IFRAME_ID = "silent-login-iframe";
    private ENABLE_IFRAME_DEBUGGING = process?.env?.["DEBUG_SILENT_IFRAME"] !== undefined;
    private userStatusHash = undefined;

    private static isPrivateConstructing = false;
    private static kccClient: KCClient | null = null;
    private silentLoginTimer: number | undefined = undefined;

    private constructor() {
        if (!KCClient.isPrivateConstructing) {
            throw new Error("Use KCClient.instance(), do not use new KCClient()");
        }

        // Listen for events from the storage api
        window.addEventListener("storage", this.handleStorageEvent);

        // Setup an on window focus listener
        window.addEventListener("focus", this.handleOnFocus);

        // Initiate the auth check
        setImmediate(() => this.authCheck());
    }

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
            console.error(`Could not update localStorage with user data`, e);
        }
    };

   private removeSilentIframe = () =>
        document.getElementById(this.IFRAME_ID)?.remove();

   private silentLogin = () => {
        // Start timer to show the lengthy login message
        clearTimeout(this.silentLoginTimer);
        this.silentLoginTimer = window.setTimeout(() => {
            const keycloakState = store.getState().keycloak;
            if (keycloakState.showLoginOverlay) {
                store.dispatch(updateKeycloakSlice({ lengthyLogin: true }));
            }
        }, 7500);

        // Create a random token if in a secure context. If not in a secure context, just generate a non-cryptographically secure "random" token
        // Dev note: This is merely a defense-in-depth approach that is paired with origin checking anyway. If this app is running in an unsecure
        //            context already, the user has already lost to a MITM attack.
        const token = window.isSecureContext
            ? self.crypto.randomUUID()
            : Math.floor(Math.random() * 100_000);

        // Make an iframe to make auth request
        const iframe = document.createElement("iframe");
        iframe.id = this.IFRAME_ID;
        //todo: fix up this line from the start
        iframe.setAttribute(
            "srcDoc",
            silentLoginIframeHTML(
                `http://localhost:4000/auth/login?silent=FULL&silent-token=${token}`,
                token,
                this.ENABLE_IFRAME_DEBUGGING
            )
        );
        iframe.setAttribute(
            "sandbox",
            "allow-scripts allow-same-origin allow-forms"
        );
        iframe.style.display = "none";

        //todo: move to somewhere else
        const acceptableOrigins = ["http://localhost:4000", window.origin];

        // Subscribe to messages from child
        window.addEventListener("message", (event: MessageEvent<SilentLoginMessage>) => {
            // Ignore message not from our an allowed origin or does not have the correct token
            if (
                !acceptableOrigins.includes(event.origin) ||
                event.data.token !== token
            )
                return;

            // Extract the silent login message
            const silentLoginMessage = event.data;

            //todo: change this to pino logger
            console.debug(`KCC Parent received: ${silentLoginMessage.event}`);

            // Handle the message
            switch (silentLoginMessage.event) {
                case SilentLoginEvent.CHILD_ALIVE:
                    // NO-OP
                    break;
                case SilentLoginEvent.LOGIN_REQUIRED:
                case SilentLoginEvent.LOGIN_SUCCESS:
                    // Update the user status and interface
                    this.storeUserStatus(silentLoginMessage.data);
                    this.removeSilentIframe();
                    break;
                case SilentLoginEvent.LOGIN_ERROR:
                default:
                    // Direct the user to a login error page manually
                    store.dispatch(
                        updateKeycloakSlice({
                            showMustLoginOverlay: true,
                            lengthyLogin: false,
                        })
                    );
                    this.removeSilentIframe();
            }
        });

        // Mount the iframe
        document.body.appendChild(iframe);
    };

   private authCheck = () => {
        // Check for a valid access token
        if (KCClient.isTokenCurrent(TokenType.ACCESS)) return;

        // todo: lock this function IOT prevent a stack of auth checks from occurring

        // Check for a valid refresh token
        if (KCClient.isTokenCurrent(TokenType.REFRESH)) {
            // Make a request to the user-status page in order to update the token
        }

        // Attempt to reauthenticate silently
        this.silentLogin();

        // Show the login page
        store.dispatch(updateKeycloakSlice({ showLoginOverlay: true }));
    };

   private handleOnFocus = () => {
        // todo: do an auth check
    };

    //todo: This ought to call a user provided handler in the future
   private handleUpdatedUserStatus = () => {
        // Grab the user status from local storage
        const userStatusWrapped = JSON.parse(
            localStorage.getItem(LocalStorage.USER_STATUS) ?? "{}"
        );

        // Check the resultant object for the proper type
       if (!is<UserStatusWrapped>(userStatusWrapped)) return;

        // Check to see if the hash is not different
        if (this.userStatusHash === userStatusWrapped["md5"]) return;

        // Grab the user status payload
        const userStatus = userStatusWrapped["payload"];

        // Check for a missing payload
        if (userStatus === undefined) return;

        // Update the user status hash
        this.userStatusHash = userStatusWrapped["md5"];

        const showMustLoginOverlay = userStatus["loggedIn"] !== true;

        // Update the redux store
        store.dispatch(
            updateKeycloakSlice({
                initialized: !showMustLoginOverlay,
                showMustLoginOverlay: showMustLoginOverlay,
                showLoginOverlay: showMustLoginOverlay,
                lengthyLogin: false,
            })
        );

        const userInfo = userStatus["userInfo"];
        const groupAuth = userStatus["groupAuth"];

        // Restructure organizations
        for (const [orgKey, orgRoles] of Object.entries(
            groupAuth["organizations"] ?? {}
        )) {
            groupAuth["organizations"][orgKey] = {
                orgRoles: orgRoles,
                apps: {},
            };
        }

        // Custom adapter to align application roles under org structure
        // Loop through the applications
        for (const [appName, appData] of Object.entries(
            groupAuth["applications"] ?? {}
        )) {
            // Loop through the application orgs
            for (const [appOrg, appOrgPermissions] of Object.entries(appData)) {
                // Ignore app-wide permissions
                if (appOrg === "_") continue;

                // Initiate the organization if required
                groupAuth["organizations"][appOrg] ??= {
                    orgRoles: [],
                    apps: {},
                };

                // Store the application permissions
                groupAuth["organizations"][appOrg]["apps"][appName] = appOrgPermissions;
            }
        }

        if (!showMustLoginOverlay && userInfo !== undefined) {
            // Update the user assets
            store.dispatch(
                setUserAssets({
                    populated: true,
                    groups: groupAuth,
                    profile: userInfo,
                    username:
                        `${userInfo["given_name"]} ${userInfo["family_name"]}`.trim(),
                    uid: userInfo["sub"], //todo: figure out the difference between this and sub
                    email: userInfo["email"],
                    // token: "DO_NOT_USE_THIS_ANYMORE",
                    selectedOrg: Object.keys(groupAuth["organizations"] ?? {})[0] ?? "",
                    sub: userInfo["sub"],
                })
            );
        }
    };

   private handleStorageEvent = (event: StorageEvent) => {
        // Check for the user data update
        if (event.key !== LocalStorage.USER_STATUS) return;

        // Call helper function to handle any changes to the status
        this.handleUpdatedUserStatus();
    };

    static authCheckGlobal = () => {
        //todo: ensure only one call to this function is running at a time

        // Initiate the auth check
        KCClient.instance().authCheck();
    };

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

        return (
           Date.now() < expirationTimestamp
        );
    };

    static handleLogout = () => {
        //todo: build out, possibly handle logout in the background?

        // Redirect the user to the logout page
        const form = document.createElement("form");
        form.method = "post";
        form.action = isDev()
            ? "http://localhost:4000/auth/logout"
            : "/auth/logout";

        // Append the form to the body
        document.body.appendChild(form);

        // Submit the form
        form.submit();

        // Remove the form from the body after submission
        document.body.removeChild(form);
    };

    static instance = (): KCClient => {
        // Return the client if already initiated
        if (this.kccClient) return this.kccClient;

        // Set the flag and initiate
        this.isPrivateConstructing = true;
        const client = new KCClient();
        this.isPrivateConstructing = false;

        // Store the singleton
        this.kccClient = client;

        // Return the client
        return this.kccClient;
    };
}

// function openWindowWithPost(url: string) {
//     // Create a new form element
//     const form = document.createElement("form");
//     form.method = "post";
//     form.action = url;
//     form.target = "_blank"; // Open in a new window/tab
//
//     // Append the form to the body
//     document.body.appendChild(form);
//
//     // Submit the form
//     form.submit();
//
//     // Remove the form from the body after submission
//     document.body.removeChild(form);
// }
