import {useKeycloakConnector} from "../use-keycloak-connector.js";
import {Dialog, Stack} from "@mui/material";
import {ButtonExpressionLevel, Overlay} from "./Overlay.js";
import type {ReactNode} from "react";

export const Login = ({children}: {children: ReactNode}) => {
    const [kccContext] = useKeycloakConnector();

    let expressionLevel: ButtonExpressionLevel;

    if (kccContext.showMustLoginOverlay) {
        expressionLevel = "expressed";
    } else if (kccContext.lengthyLogin) {
        expressionLevel = "regular";
    } else {
        expressionLevel = "subdued";
    }

    const overlayProps = {
        mainMsg: kccContext.showMustLoginOverlay ? "Authentication Required" : "Checking credentials",
        subMsg: !kccContext.showMustLoginOverlay && kccContext.lengthyLogin ? "this is taking longer than expected" : undefined,
        button: {
            label: "Login",
            onClick: () => kccContext.kccClient?.handleLogin(kccContext.initiated),
            newWindow: kccContext.initiated,
            expressionLevel: expressionLevel,
        }
    };

    return (
        <Dialog open={true} scroll={"body"}>
            <Stack
                p={2}
                spacing={3}
                alignItems="center"
                sx={{ background: "#051827", color: "white" }}
            >
                <Overlay {...overlayProps}>
                    {children}
                </Overlay>
            </Stack>
        </Dialog>
    );
}

