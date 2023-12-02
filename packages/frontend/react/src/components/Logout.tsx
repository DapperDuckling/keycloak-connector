import {Button, Dialog, Stack} from "@mui/material";
import {useKeycloakConnector} from "../use-keycloak-connector.js";
import {KccDispatchType, reducer} from "../reducer.js";
import {Overlay} from "./Overlay.js";
import type {ReactNode} from "react";

export const Logout = ({children}: {children: ReactNode}) => {
    const [kccContext, kccDispatch] = useKeycloakConnector();

    const overlayProps = {
        mainMsg: "Are you sure you want to log out?",
        button: {
            label: "Logout",
            onClick: () => {
                kccDispatch({type: KccDispatchType.EXECUTING_LOGOUT});
                kccContext.kccClient?.handleLogout();
            },
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
