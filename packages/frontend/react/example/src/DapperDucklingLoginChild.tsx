import {Box, CircularProgress} from "@mui/material";
import {useKeycloakConnector} from "@dapperduckling/keycloak-connector-react";
import DapperDucklingLogo from "../assets/logo.svg";

interface Props {
    logo?: string;
}

export const DapperDucklingLoginChild = ({logo}: Props) => {

    const [kccContext] = useKeycloakConnector();

    return (
        <>
            <Box sx={{ position: "relative", height: 180, width: 180, marginTop: '0 !important' }}>
                <Box
                    component="img"
                    src={logo ?? DapperDucklingLogo}
                    height="100%"
                    width="100%"
                    alt="DapperDuckling Logo"
                />
                {kccContext.ui.silentLoginInitiated && !kccContext.ui.showMustLoginOverlay && (
                    <>
                        <Box sx={center}>
                            <CircularProgress
                                size={180}
                                thickness={0.5}
                                // @ts-ignore
                                color="black"
                                sx={blackProgress}
                            />
                        </Box>
                        <Box sx={center}>
                            <CircularProgress
                                size={180}
                                thickness={0.5}
                                // @ts-ignore
                                color="red"
                                sx={redProgress}
                            />
                        </Box>
                    </>
                )}
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
const redProgress = { animationDuration: "12s", color: "#e1af35" };
