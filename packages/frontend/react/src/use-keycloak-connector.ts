import {useContext} from "react";
import type {KeycloakConnectorContextProps} from "./keycloak-connector-context.js";
import {KeycloakConnectorContext} from "./keycloak-connector-context.js";

export const useKeycloakConnector = (): KeycloakConnectorContextProps => {
    const context = useContext(KeycloakConnectorContext);
    if (!context) {
        throw new Error("useKeycloakConnector must be used in components that are children of a <KeycloakConnectorProvider> component.");
    }

    return context;
};
