
(() => {
    // Check for a parent window
    if (!window.parent) {
        console.error('No parent window found, cannot listen');
        return;
    }

    // Check for a token
    const token = new URL(location.href).searchParams.get('silent-token');
    if (!token) {
        console.error('No silent token found, cannot listen');
        return;
    }

    // Grab the reference to the parent
    const parent = window.parent;

    // Check if this page has not been loaded in an iframe
    // (cannot use frameElement due to different origins)
    if (window.top === window.self) {
        // Redirect the user to this page's origin root uri
        console.error(`Not loaded in iframe, redirecting to window's origin`);
        window.location.href = window.location.origin;
        return;
    }

    // Setup the parent message
    window.addEventListener("message", () => {

    });

    // Tell the parent we are alive
    parent.postMessage({
        token: token,
        event: `CHILD_ALIVE`,
    }, "*");

    // Listen to broadcast channel messages
    const bc = new BroadcastChannel('login-listener');

    bc.onmessage = (event) => {
        console.debug(`Broadcast msg received`, event);

        // Inform the parent a login success occurred
        parent.postMessage({
            token: token,
            event: `LOGIN_SUCCESS`,
        }, parent.location.origin);
    }

})();
