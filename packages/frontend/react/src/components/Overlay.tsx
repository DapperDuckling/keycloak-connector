import {Box, Button, Dialog, IconButton, Stack, Typography} from "@mui/material";
import type {ReactNode} from "react";
import {OpenInNew, Close} from '@mui/icons-material';
import { useKeycloakConnector } from "../use-keycloak-connector.js";
import {KccDispatchType} from "../types.js";

export type ButtonExpressionLevel = "subdued" | "regular" | "expressed";

export interface OverlayProps {
    children?: ReactNode;
    mainMsg: string;
    subMsg?: string | undefined;
    userCanClose?: boolean;
    button: {
        label: string;
        onClick: () => void;
        newWindow?: boolean;
        expressionLevel?: ButtonExpressionLevel;
    }
}

export const Overlay = (props: OverlayProps) => {

    // Update the expression level if not set
    props.button.expressionLevel ??= "expressed";

    const [kccContext, kccDispatch] = useKeycloakConnector();

    return (
        <Dialog
            open={true}
            scroll={"body"}
            disableEnforceFocus={false} // Play nicely with other dialogs
        >
            <Stack
                p={2}
                spacing={3}
                alignItems="center"
                sx={{ background: "#051827", color: "white", minWidth: 265 }}
            >
                {props.userCanClose &&
                    <IconButton
                        aria-label="close"
                        onClick={() => {
                            kccContext.kccClient?.abortBackgroundLogins();
                            kccDispatch({type: KccDispatchType.HIDE_DIALOG});
                        }}
                        sx={{
                            position: 'absolute',
                            right: 8,
                            top: 8,
                            color: (theme) => theme.palette.grey[500],
                        }}
                    >
                        <Close />
                    </IconButton>
                }
                {props.children}
                <Box sx={{textAlign: "center"}}>
                    <Typography variant="h6" align="center" sx={{marginTop: 1}}>{props.mainMsg}</Typography>
                    <Typography
                        variant="caption"
                        display="block"
                        color="#ef9a9a"
                        sx={{
                            fontVariantCaps: "all-small-caps",
                            marginTop: "-3px",
                            marginBottom: "-17px",
                            visibility: props.subMsg !== undefined && props.subMsg.trim() !== "" ? "visible" : "hidden",
                        }}
                    >{props.subMsg ?? "&nbsp;"}</Typography>
                </Box>
                <Button
                    component="label"
                    {...props.button.newWindow && {endIcon: <OpenInNew />}}
                    onClick={props.button.onClick}
                    variant={props.button.expressionLevel === "subdued" ? "outlined" : "contained"}
                    sx={{
                        width: "100%",
                        opacity: props.button.expressionLevel === "subdued" ? "0.6" : "1.0",
                    }}
                    color={props.button.expressionLevel === "expressed" ? "info" : "primary"}
                >
                    {props.button.label}
                </Button>
            </Stack>
        </Dialog>
    );
}

