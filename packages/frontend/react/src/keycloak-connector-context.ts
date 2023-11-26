import {createContext} from "react";
import {KeycloakConnectorClient} from "@dapperduckling/keycloak-connector-client";
import type {KeycloakConnectorState} from "./types.js";

export interface KeycloakConnectorContextProps extends KeycloakConnectorState {
    kccClient?: KeycloakConnectorClient,
}

//temp dev note: if anything is added here, need to consider LOGOUT_SUCCESS where the state is reset to this object
export const initialContext: KeycloakConnectorContextProps = {
    userStatus: {
        userInfo: undefined,
        loggedIn: false,
    },
    initiated: false,
    lengthyLogin: false,
    showLoginOverlay: true,
    silentLoginInitiated: false,
    showMustLoginOverlay: false,
    loginError: false,
}

export const KeycloakConnectorContext = createContext<KeycloakConnectorContextProps | undefined>(undefined);
KeycloakConnectorContext.displayName = "KeycloakConnectorContext";
