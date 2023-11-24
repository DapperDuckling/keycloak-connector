import {SilentLoginEvent as SilentLoginEventType} from "./kcc-temp.js";

const silentLoginIframe = (authUrl, token, silentLoginEventJson, enableDebugger) => {

  // Dev helper
  if (enableDebugger === true) debugger;

  // Decode the silent login event constants
  const SilentLoginEvent = JSON.parse(silentLoginEventJson);

  // Grab the reference to the parent
  const parent = window.parent;

  // Update the error link
  document.querySelector("#back-to-main").href = window.location.origin;

  // Check if this page has not been loaded in an iframe
  if (window.frameElement === null) {
    // Redirect the user to this page's origin root uri
    window.location.href = window.location.origin;
    return;
  }

  // Ensure the entire page's origins match (top and parent)
  if (window.top.origin !== parent.origin) {
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

export const silentLoginIframeHTML = (authUrl, token, enableDebugger) => {
  // Build the html for the silent login iframe
  const silentLoginFunction = silentLoginIframe.toString();

  // Ensure the auth url is clean
  authUrl = authUrl.replaceAll('"', '\\"');

  // Grab the silent login event constants and add slashes
  const silentLoginEventJson = JSON.stringify(SilentLoginEventType).replaceAll('"', '\\"');

  // Return the html
  return `
    <!doctype html>
    <html lang="en">
      <body>
      <h3>Silent Login</h3>
      <p>This page loaded in error. <a id="back-to-main" href="#">Back to main</a></p>
      <script>
        (${silentLoginFunction})("${authUrl}", "${token}", "${silentLoginEventJson}", ${(enableDebugger) ? "true" : "false"});
      </script>
      </body>
    </html>
  `;
}
