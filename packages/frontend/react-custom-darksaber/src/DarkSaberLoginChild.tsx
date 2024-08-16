import {Box, CircularProgress, Typography} from "@mui/material";
import DarkSaberLogo from "../assets/DarkSaberLogo300x300.webp";
import { useKeycloakConnector } from "@dapperduckling/keycloak-connector-react";
import {useState} from "react";

interface Props {
    logo?: string;
}

export const DarkSaberLoginChild = ({logo}: Props) => {

    const [kccContext] = useKeycloakConnector();
    const [isLogoLoaded, setIsLogoLoaded] = useState(false);
    const [isLogoError, setIsLogoError] = useState(false);

    const hideLogoBlock = isLogoError && kccContext.ui.showMustLoginOverlay;

    return (
        <>
            <Typography variant="h5">Dark Saber Authenticator</Typography>
            <Box sx={{
                position: "relative",
                width: 210,
                transition: 'height 0.5s cubic-bezier(0.22, 0.61, 0.36, 1), margin-top 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)',
                // When we have a logo loading error and authentication is required (done loading) hide this block
                height: !(hideLogoBlock) ? 210 : '0',
                overflow: 'hidden',
                ...hideLogoBlock && {marginTop: 0},
            }}>
                <Box sx={{
                    position: "relative",
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: 210,
                }}>
                    {!isLogoLoaded && (
                        <Box
                            display="flex"
                            justifyContent="center"
                            alignItems="center"
                            flexDirection="column"
                            position="absolute"
                        >
                            <Typography variant="body2" sx={{fontVariant: "all-small-caps"}}>loading</Typography>
                        </Box>
                    )}
                    <Box
                        component="img"
                        src={logo ?? DarkSaberLogo}
                        height="100%"
                        width="100%"
                        alt="Logo"
                        sx={{
                            display: isLogoLoaded ? "block" : "none"
                        }}
                        onLoad={() => {
                            setIsLogoLoaded(true);
                            setIsLogoError(false);
                        }}
                        onError={() => setIsLogoError(true)}
                    />
                    {kccContext.ui.silentLoginInitiated && !kccContext.ui.showMustLoginOverlay && (
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
            </Box>
        </>
    );
}

const center = {
    position: "absolute",
    top: "calc(50% + 2px)",
    left: "50%",
    transform: "translate(-50%, -50%)",
    overflow: "hidden",
};
const blackProgress = { animationDuration: "12s", animationDelay: "6s" };
const redProgress = { animationDuration: "12s" };
