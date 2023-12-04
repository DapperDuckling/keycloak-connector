import {useKeycloakConnector} from "../use-keycloak-connector.js";
import {Overlay} from "./Overlay.js";
import {AuthProps, KccDispatchType} from "../types.js";

export const Logout = ({children}: AuthProps) => {
    const [kccContext, kccDispatch] = useKeycloakConnector();

    const overlayProps = {
        mainMsg: "Are you sure you want to log out?",
        button: {
            label: "Logout",
            onClick: () => {
                kccDispatch({type: KccDispatchType.EXECUTING_LOGOUT});
                kccContext.kccClient?.handleLogout();
            },
        },
        userCanClose: true,
    };

    return (
        <Overlay {...overlayProps}>
            {children}
        </Overlay>
    );
}
