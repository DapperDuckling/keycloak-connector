// import React from "react";
import {useKeycloakConnector} from "../use-keycloak-connector.js";
import {
    Box,
    Button,
    CircularProgress, createTheme,
    Dialog,
    Stack, ThemeProvider,
    Typography,
} from "@mui/material";

export const Authorization = () => {
    const [kccContext] = useKeycloakConnector();

    return (
        <Dialog open={true} scroll={"body"}>
            <Stack
                p={2}
                spacing={3}
                alignItems="center"
                sx={{ background: "#051827", color: "white" }}
            >
                <Typography variant="h5">Dark Saber Authenticator</Typography>
                {/*<Box sx={{ position: "relative", height: 210, maxHeight: '20vh', minHeight: 120 }}>*/}
                <Box sx={{ position: "relative", height: 210, width: 210 }}>
                    <Box
                        component="img"
                        src={`https://s3-public.devilops.dso.mil/DarkSaberLogo300x300.webp`}
                        height="100%"
                        width="100%"
                        alt="Dark Saber Logo"
                    />
                    {kccContext.silentLoginInitiated && !kccContext.showMustLoginOverlay && (
                        <>
                            <Box sx={center}>
                                <CircularProgress
                                    size={210}
                                    thickness={0.5}
                                    // @ts-ignore
                                    color="black"
                                    sx={blackProgress}
                                />
                            </Box>
                            <Box sx={center}>
                                <CircularProgress
                                    size={210}
                                    thickness={0.5}
                                    // @ts-ignore
                                    color="red"
                                    sx={redProgress}
                                />
                            </Box>
                        </>
                    )}
                </Box>
                <div>
                    {kccContext.showMustLoginOverlay && (
                        <Typography variant="h6">Authentication Required</Typography>
                    )}
                    {!kccContext.showMustLoginOverlay && (
                        <Typography variant="h6" align="center">Checking credentials</Typography>
                    )}
                    <Typography
                        variant="caption"
                        display="block"
                        color="#ef9a9a"
                        sx={{
                            fontVariantCaps: "all-small-caps",
                            marginTop: "-3px",
                            marginBottom: "-17px",
                            visibility: !kccContext.showMustLoginOverlay && kccContext.lengthyLogin ? "visible" : "hidden",
                        }}
                    >this is taking longer than expected</Typography>
                </div>
                <Button
                    onClick={() => kccContext.kccClient?.handleLogin()}
                    variant={kccContext.showMustLoginOverlay ? "contained" : "outlined"}
                    sx={{
                        width: "100%",
                        opacity: !kccContext.showMustLoginOverlay && !kccContext.lengthyLogin ? "0.6" : "1.0",
                    }}
                    color={kccContext.showMustLoginOverlay ? "info" : "primary"}
                >
                    Login
                </Button>
            </Stack>
        </Dialog>
    );
}

//todo: remove?
const loading = {
    display: "inline-block",
    fontSize: "30px",
    clipPath: "inset(0 3ch 0 0)",
    animation: "loading 1s steps(4) infinite",
    background: "transparent",
};

//todo: remove?
const style = {
    width: "240px",
    height: "240px",
    opacity: "50%",
    p: 2,
    background: "transparent",
};

const center = {
        position: "absolute",
        top: "calc(50% + 2px)",
        left: "50%",
        transform: "translate(-50%, -50%)",
        overflow: "hidden",
    },
    blackProgress = { animationDuration: "12s", animationDelay: "6s" },
    redProgress = { animationDuration: "12s" };

