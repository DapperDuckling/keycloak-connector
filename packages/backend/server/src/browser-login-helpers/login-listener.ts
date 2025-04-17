import {SilentLoginEvent as SilentLoginEventType, type SilentLoginMessage} from "@dapperduckling/keycloak-connector-common";
import {LOGIN_LISTENER_BROADCAST_CHANNEL} from "./common.js";

interface LoginListenerParams {
    sourceOrigin: string | undefined;
    SilentLoginEvent: typeof SilentLoginEventType;
    loginListenerChannel: string;
    enableDebugger: boolean;
}

const loginListener = (
    {sourceOrigin, SilentLoginEvent, loginListenerChannel, enableDebugger}: LoginListenerParams
) => {

    // Dev helper
    if (enableDebugger) debugger;

    // TODO: CHECK THIS FOR XSS ATTACKS. SEE IF WE CAN BREAK OUT OF THE SCRIPT TAG

    // Update the error link
    const backToMainLink = document.querySelector<HTMLAnchorElement>("#back-to-main");
    if (backToMainLink) backToMainLink.href = window.location.origin;

    // Check for an origin
    if (sourceOrigin === undefined) {
        console.error(`Missing source origin, cannot set up login listener!`);
        return;
    }

    // Check for no parent window
    if (window.parent === window) {
        console.error('No parent window found, cannot listen');
        return;
    }

    // Check for a token
    const token = new URL(location.href).searchParams.get('silent-token');
    if (!token) {
        console.error('No silent token found, cannot listen');
        return;
    }

    // Grab the real reference to the parent
    const parent = window.parent;

    // Check if this page has not been loaded in an iframe
    // (cannot use frameElement due to different origins)
    if (window.top === window.self) {
        // Redirect the user to this page's origin root uri
        console.error(`Not loaded in iframe, redirecting to window's origin`);
        window.location.href = window.location.origin;
        return;
    }

    // Tell the parent we are alive
    parent.postMessage({
        token: token,
        event: SilentLoginEvent.LOGIN_LISTENER_ALIVE,
    }, sourceOrigin);

    // Listen to broadcast channel messages
    const bc = new BroadcastChannel(loginListenerChannel);
    bc.onmessage = (event: MessageEvent<SilentLoginMessage>) => {
        if (enableDebugger) console.debug(`Broadcast msg received`, event);

        // Pass the message up to the parent
        parent.postMessage(event.data, sourceOrigin);
    }
}

export const loginListenerHTML = (sourceOrigin: string | undefined, enableDebugger: boolean) => {
    // Build the html
    const loginListenerFunction = loginListener.toString();
    const payload = {
        sourceOrigin,
        enableDebugger,
        SilentLoginEvent: SilentLoginEventType,
        channel: LOGIN_LISTENER_BROADCAST_CHANNEL,
    };

    // Return the html
    return `
    <!doctype html>
    <html lang="en">
      <body>
      <h3>Login Listener</h3>
      <p>This page loaded in error. <a id="back-to-main" href="#">Back to main</a></p>
      <script id="login-listener-data" type="application/json">
        ${JSON.stringify(payload)}
      </script>
      <script>
        const data = JSON.parse(document.getElementById("login-listener-data").textContent);
        (${loginListenerFunction})(data);
      </script>
      </body>
    </html>
  `;
}
