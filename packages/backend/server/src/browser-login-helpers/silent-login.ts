import {
    SilentLoginEvent as SilentLoginEventType,
    type SilentLoginMessage
} from "@dapperduckling/keycloak-connector-common";
import {LOGIN_LISTENER_BROADCAST_CHANNEL, SILENT_LOGIN_EVENT_JSON} from "./common.js";

const silentLoginResponse = (
    messageJson: string,
    token: string,
    silentLoginEventJson: string,
    loginListenerChannel: string,
    autoClose: boolean,
    sourceOrigin: string | undefined,
    enableDebugger: boolean
) => {

    // Dev helper
    if (enableDebugger) debugger;

    // Decode the silent login event constants
    const SilentLoginEvent = JSON.parse(silentLoginEventJson) as typeof SilentLoginEventType;

    // Grab the real reference to the parent
    const parent = window.parent;

    // Update the error link
    const backToMainLink = document.querySelector<HTMLAnchorElement>("#back-to-main");
    if (backToMainLink) backToMainLink.href = window.location.origin;

    // Check for an origin
    if (sourceOrigin === undefined) {
        console.error(`Missing source origin, cannot process silent login!`);
        return;
    }

    const messageToParent: SilentLoginMessage = {
        token: token,
        event: SilentLoginEvent.LOGIN_ERROR,
    }

    try {
        // Check for a message from the server
        if (messageJson === undefined) {
            console.error(`Missing message from auth server, cannot process silent login!`);
            return;
        }

        // Ensure we can parse the message
        const message = JSON.parse(messageJson);

        // Update the message to parent event
        messageToParent.event = message.event;

        // Check for a non-error event
        switch (message.event) {
            case SilentLoginEvent.LOGIN_SUCCESS:
            case SilentLoginEvent.LOGIN_REQUIRED:
                if (message.data) {
                    messageToParent.data = message.data;
                }
                break;
        }

    } catch (e) {
        // Update the output
        messageToParent.event = SilentLoginEvent.LOGIN_ERROR;
        console.error(`Could not parse message`);

    } finally {
        // Handle auto-closing login types
        if (autoClose) {
            // Hop on the broadcast channel
            const bc = new BroadcastChannel(loginListenerChannel);
            bc.postMessage(messageToParent);
            bc.close();

            // Attempt to close the window
            window.close();

            // If window is not closed, redirect to main page
            setTimeout(() => {
                console.warn(`Failed to close partially silent login window, redirecting to source origin`);
                window.location.href = sourceOrigin;
            }, 50);


        } else {
            // Send the parent a message window
            parent.postMessage(messageToParent, sourceOrigin);
        }
    }
}

export const silentLoginResponseHTML = (message: SilentLoginMessage, token: string, autoClose: boolean, sourceOrigin: string | undefined, enableDebugger: boolean) => {
    // Build the html for the silent login iframe
    const silentLoginResponseFunction = silentLoginResponse.toString();

    // Convert the message to a json string and add slashes
    const messageJson = JSON.stringify(message).replaceAll('"', '\\"');

    // Prepare the source origin
    const sourceOriginFormatted = (sourceOrigin === undefined) ? undefined : `"${sourceOrigin}"`

    // Return the html
    return `
    <!doctype html>
    <html lang="en">
      <body>
      <h3>Silent Login Response</h3>
      <p>This page loaded in error. <a id="back-to-main" href="#">Back to main</a></p>
      <script>
        (${silentLoginResponseFunction})("${messageJson}", "${token}", "${SILENT_LOGIN_EVENT_JSON}", "${LOGIN_LISTENER_BROADCAST_CHANNEL}", ${autoClose}, ${sourceOriginFormatted}, ${enableDebugger});
      </script>
      </body>
    </html>
  `;
}
