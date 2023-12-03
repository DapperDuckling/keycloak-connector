import {
    SilentLoginEvent as SilentLoginEventType,
    type SilentLoginMessage
} from "@dapperduckling/keycloak-connector-common";

const silentLoginResponse = (
    messageJson: string,
    token: string,
    silentLoginEventJson: string,
    autoClose: boolean,
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
        // Send the parent a message
        parent.postMessage(messageToParent, "*"); //todo: lock down with origin

        // Handle auto-closing login types
        if (autoClose) {
            // Hop on the broadcast channel
            if (messageToParent.event === SilentLoginEvent.LOGIN_SUCCESS) {
                const bc = new BroadcastChannel("login-listener");
                bc.postMessage(SilentLoginEvent.LOGIN_SUCCESS);
            }

            // Attempt to close the window
            window.close();

            // If window is not closed, redirect to main page
            setTimeout(() => {
                console.warn(`Failed to close partially silent login window, redirecting to origin`);
                window.location.href = window.origin;
            }, 50);
        }
    }
}

export const silentLoginResponseHTML = (message: SilentLoginMessage, token: string, autoClose: boolean, enableDebugger: boolean) => {
    // Build the html for the silent login iframe
    const silentLoginResponseFunction = silentLoginResponse.toString();

    // Convert the message to a json string and add slashes
    const messageJson = JSON.stringify(message).replaceAll('"', '\\"');

    // Grab the silent login event constants and add slashes
    const silentLoginEventJson = JSON.stringify(SilentLoginEventType).replaceAll('"', '\\"');

    // Return the html
    return `
    <!doctype html>
    <html lang="en">
      <body>
      <h3>Silent Login Response</h3>
      <p>This page loaded in error. <a id="back-to-main" href="#">Back to main</a></p>
      <script>
        (${silentLoginResponseFunction})("${messageJson}", "${token}", "${silentLoginEventJson}", "${autoClose}", ${(enableDebugger) ? "true" : "false"});
      </script>
      </body>
    </html>
  `;
}
