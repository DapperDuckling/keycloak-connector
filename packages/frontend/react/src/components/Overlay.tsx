import {Button, Dialog, Stack, Typography} from "@mui/material";
import type {ReactNode} from "react";
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

export type ButtonExpressionLevel = "subdued" | "regular" | "expressed";

interface OverlayProps {
    children?: ReactNode;
    mainMsg: string;
    subMsg?: string | undefined;
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

    return (
        <Dialog open={true} scroll={"body"}>
            <Stack
                p={2}
                spacing={3}
                alignItems="center"
                sx={{ background: "#051827", color: "white" }}
            >
                {props.children}
                <div>
                    <Typography variant="h6" align="center">{props.mainMsg}</Typography>
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
                </div>
                <Button
                    /*{...props.button.newWindow && {startIcon: <OpenInNewIcon />}}*/
                    onClick={props.button.onClick}
                    variant={props.button.expressionLevel === "subdued" ? "outlined" : "contained"}
                    sx={{
                        width: "100%",
                        opacity: props.button.expressionLevel !== "expressed" ? "0.6" : "1.0",
                    }}
                    color={props.button.expressionLevel === "expressed" ? "info" : "primary"}
                >
                    {props.button.label}
                </Button>
            </Stack>
        </Dialog>
    );
}

