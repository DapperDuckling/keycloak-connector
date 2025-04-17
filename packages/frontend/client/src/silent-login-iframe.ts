import {SilentLoginEvent as SilentLoginEventType} from "@dapperduckling/keycloak-connector-common";
import {
  LOGIN_LISTENER_BROADCAST_CHANNEL
} from "@dapperduckling/keycloak-connector-server/dist/browser-login-helpers/common";

interface SilentLoginIframeParams {
  authUrl: string;
  token: string;
  SilentLoginEvent: typeof SilentLoginEventType;
  enableDebugger: unknown;
}

const silentLoginIframe = ({authUrl, token, SilentLoginEvent, enableDebugger}: SilentLoginIframeParams) => {

  // Dev helper
  if (enableDebugger === true) debugger;

  // Grab the reference to the parent
  const parent = window.parent;

  // Grab a reference to the error link
  const backToMain = document.querySelector<HTMLLinkElement>("#back-to-main");

  // Ensure the back to main link exists
  if (backToMain !== null) {
    // Update the error link
    backToMain.href = window.location.origin;
  }

  // Check if this page has not been loaded in an iframe
  if (window.frameElement === null) {
    // Redirect the user to this page's origin root uri
    console.error(`Not loaded in iframe, redirecting to window's origin`);
    window.location.href = window.location.origin;
    return;
  }

  // Ensure the entire page's origins match (top and parent)
  if (window.top?.origin !== parent.origin) {
    // Do nothing since the origins do not match
    console.error(`Origins do not match, will not process silent login!`);
    return;
  }

  // Check for an auth url
  if (authUrl === undefined) {
    console.error(`Missing authUrl from parent, cannot process silent login!`);
    return;
  }

  // Tell the parent we are alive
  parent.postMessage({
    token: token,
    event: SilentLoginEvent.CHILD_ALIVE,
  }, parent.location.origin);

  // Make a form, add it to the page, then submit it
  const form = document.createElement('form');
  form.method = 'post';
  form.action = authUrl;
  form.style.display = 'none';
  document.body.appendChild(form);
  form.submit();
}

export const silentLoginIframeHTML = (authUrl: string, token: string, enableDebugger: boolean) => {
  // Build the html for the silent login iframe
  const silentLoginFunction = silentLoginIframe.toString();

  const payload = {
    authUrl,
    token,
    enableDebugger,
    SilentLoginEvent: SilentLoginEventType,
    channel: LOGIN_LISTENER_BROADCAST_CHANNEL,
  };

  // Return the html
  return `
    <!doctype html>
    <html lang="en">
      <body>
      <h3>Silent Login</h3>
      <p>This page loaded in error. <a id="back-to-main" href="#">Back to main</a></p>
      <script id="silent-login-iframe-data" type="application/json">
        ${JSON.stringify(payload)}
      </script>
      <script>
        const data = JSON.parse(document.getElementById("silent-login-iframe-data").textContent);
        (${silentLoginFunction})(data);
      </script>
      </body>
    </html>
  `;
}
