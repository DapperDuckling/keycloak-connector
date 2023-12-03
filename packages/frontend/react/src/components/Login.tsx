import {useKeycloakConnector} from "../use-keycloak-connector.js";
import {Dialog, Stack} from "@mui/material";
import {ButtonExpressionLevel, Overlay} from "./Overlay.js";
import {AuthProps} from "../types.js";

export const Login = ({children, reactConfig}: AuthProps) => {
    const [kccContext] = useKeycloakConnector();

    let expressionLevel: ButtonExpressionLevel;

    if (kccContext.ui.showMustLoginOverlay) {
        expressionLevel = "expressed";
    } else if (kccContext.ui.lengthyLogin) {
        expressionLevel = "regular";
    } else {
        expressionLevel = "subdued";
    }

    const overlayProps = {
        mainMsg: kccContext.ui.showMustLoginOverlay ? "Authentication Required" : "Checking credentials",
        subMsg: !kccContext.ui.showMustLoginOverlay && kccContext.ui.lengthyLogin ? "this is taking longer than expected" : undefined,
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
        <Dialog open={true} scroll={"body"}>
            <Stack
                p={2}
                spacing={3}
                alignItems="center"
                sx={{ background: "#051827", color: "white"}}
            >
                <Overlay {...overlayProps}>
                    {children}
                </Overlay>
            </Stack>
        </Dialog>
    );
}

