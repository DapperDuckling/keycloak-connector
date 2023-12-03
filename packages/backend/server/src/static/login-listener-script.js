
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
    if (window.frameElement === null) {
        // Redirect the user to this page's origin root uri
        window.location.href = window.location.origin;
        return;
    }

    // Tell the parent we are alive
    parent.postMessage({
        token: token,
        event: `CHILD_ALIVE`,
    }, parent.location.origin);

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
