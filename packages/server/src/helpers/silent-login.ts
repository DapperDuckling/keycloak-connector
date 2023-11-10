import {SilentLoginEvent, SilentLoginMessage, UserStatusWrapped} from "../types.js";
import {LocalStorage} from "./cookies.js";

const silentLoginResponse = () => {

    // Dev helper
    // @ts-ignore
    if (enableDebugger === true) debugger;

    // Grab the real reference to the parent
    const parent = window.parent;

    // Update the error link
    const backToMainLink = document.querySelector<HTMLAnchorElement>("#back-to-main");
    if (backToMainLink) backToMainLink.href = window.location.origin;

    // Check if this page has not been loaded in an iframe
    if (window.frameElement === null) {
        // Redirect the user to this page's origin root uri
        window.location.href = window.location.origin;
        return;
    }

    // Ensure the entire page's origins match (top and parent)
    if (window.top === null || window.top.origin !== parent.origin) {
        // Do nothing since the origins do not match
        console.error(`Origins do not match, will not process silent login!`);
        return;
    }

    // @ts-ignore
    const localMessageJson = messageJson;

    // Check for a message from the server
    if (localMessageJson === undefined) {
        console.error(`Missing message from auth server, cannot process silent login!`);
        return;
    }

    const messageToParent: SilentLoginMessage = {
        event: SilentLoginEvent.LOGIN_ERROR,
    }

    let message;

    try {
        // Ensure we can parse the message
        message = JSON.parse(localMessageJson);

        // Update the message to parent event
        messageToParent.event = message.event;

        // Check for a non-error event
        switch (message.event) {
            case SilentLoginEvent.LOGIN_SUCCESS:
            case SilentLoginEvent.LOGIN_REQUIRED:
                messageToParent.data = message.data;
                break;
        }

    } catch (e) {
        // Update the output
        messageToParent.event = SilentLoginEvent.LOGIN_ERROR;
        console.error(`Could not parse message`);

    } finally {
        // Send the parent a message
        parent.postMessage({
            event: messageToParent.event,
            ...(messageToParent.data ?? false) && {data: messageToParent.data},
        }, parent.location.origin);
    }

    // Check for non-error event
    switch (messageToParent.event) {
        case SilentLoginEvent.LOGIN_SUCCESS:
        case SilentLoginEvent.LOGIN_REQUIRED:
            break;
        default:
            return;
    }

    try {
        // Grab the existing user status from local storage
        const existingUserStatus = JSON.parse(localStorage.getItem(LocalStorage.USER_STATUS) ?? "{}");

        // Update the local storage if this data is newer
        if (existingUserStatus["timestamp"] === undefined || existingUserStatus["timestamp"] < message.data.timestamp) {
            localStorage.setItem(LocalStorage.USER_STATUS, JSON.stringify(message.data));
        }
    } catch (e) {
        // Do nothing on purpose
    }

}

export const silentLoginResponseHTML = (messageJson: string, enableDebugger: boolean) => {
    // Build the html for the silent login iframe
    const silentLoginResponseFunction = silentLoginResponse.toString();

    // Return the html
    return `
    <!doctype html>
    <html lang="en">
      <body>
      <h3>Silent Login Response</h3>
      <p>This page loaded in error. <a id="back-to-main" href="#">Back to main</a></p>
      <script>
        const enableDebugger = ${(enableDebugger) ? "true" : "false"};
        const message = "${messageJson}";
        (${silentLoginResponseFunction})();
      </script>
      </body>
    </html>
  `;
}
