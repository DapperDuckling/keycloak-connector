import {Dispatch, useContext} from "react";
import type {KeycloakConnectorContextProps} from "./keycloak-connector-context.js";
import {KeycloakConnectorContext, KeycloakConnectorDispatchContext} from "./keycloak-connector-context.js";
import {KeycloakConnectorStateActions} from "./reducer.js";

export const useKeycloakConnector = (): [KeycloakConnectorContextProps, Dispatch<KeycloakConnectorStateActions>] => {
    const kccContext = useContext(KeycloakConnectorContext);
    const kccDispatch = useContext(KeycloakConnectorDispatchContext);
    if (!kccContext || !kccDispatch) {
        throw new Error("useKeycloakConnector must be used in components that are children of a <KeycloakConnectorProvider> component.");
    }

    return [kccContext, kccDispatch];
};
