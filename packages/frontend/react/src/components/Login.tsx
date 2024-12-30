import {useKeycloakConnector} from "../use-keycloak-connector.js";
import {ButtonExpressionLevel, Overlay, type OverlayProps} from "./Overlay.js";
import {AuthProps} from "../types.js";

export const Login = ({children, reactConfig}: AuthProps) => {
    const [kccContext] = useKeycloakConnector();
    
    const {ui} = kccContext;

    let expressionLevel: ButtonExpressionLevel;

    if (ui.showMustLoginOverlay || ui.loginError) {
        expressionLevel = "expressed";
    } else if (ui.lengthyLogin) {
        expressionLevel = "regular";
    } else {
        expressionLevel = "subdued";
    }

    const overlayProps: OverlayProps = {
        mainMsg: ui.loginError ? "Error Checking Credentials" : ui.showMustLoginOverlay ? "Authentication Required" : "Checking Credentials",
        subMsg: ui.loginError ? "Failed to communicate with server" : !ui.showMustLoginOverlay && ui.lengthyLogin ? "this is taking longer than expected" : undefined,
        button: {
            label: "Login",
            onClick: () => kccContext.kccClient?.handleLogin(kccContext.hasAuthenticatedOnce),
            newWindow: kccContext.hasAuthenticatedOnce,
            expressionLevel: expressionLevel,
        },
        userCanClose: !!(kccContext.hasAuthenticatedOnce || reactConfig?.deferredStart),
    }

    // Start the login listener if login will be with a new window
    if (kccContext.hasAuthenticatedOnce) kccContext.kccClient?.prepareToHandleNewWindowLogin();

    return (
        <Overlay {...overlayProps}>
            {children}
        </Overlay>
    );
}

