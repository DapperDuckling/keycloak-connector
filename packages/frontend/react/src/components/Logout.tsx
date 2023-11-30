import {Button} from "@mui/material";
import {useKeycloakConnector} from "../use-keycloak-connector.js";
import {KccDispatchType, reducer} from "../reducer.js";
import {useImmerReducer} from "use-immer";
import {initialContext} from "../keycloak-connector-context.js";

export const Logout = () => {
    const [kccContext, kccDispatch] = useKeycloakConnector();

    return (
        <Button
            onClick={() => {
                kccDispatch({type: KccDispatchType.EXECUTING_LOGOUT});
                kccContext.kccClient?.handleLogout();
            }}
            variant={"contained"}
            sx={{
                width: "100%",
            }}
            color={"info"}
        >
            Logout
        </Button>
    )
}
