import {createContext, Dispatch} from "react";
import {KeycloakConnectorClient} from "@dapperduckling/keycloak-connector-client";
import type {KeycloakConnectorState} from "./types.js";
import {KeycloakConnectorStateActions} from "./reducer.js";

export interface KeycloakConnectorContextProps extends KeycloakConnectorState {
    kccClient?: KeycloakConnectorClient,
}

//temp dev note: if anything is added here, need to consider LOGOUT_SUCCESS where the state is reset to this object
export const initialContext: KeycloakConnectorContextProps = {
    userStatus: {
        userInfo: undefined,
        loggedIn: false,
        accessExpires: -1,
        refreshExpires: -1,
    },
    hasAuthenticatedOnce: false,
    ui: {
        lengthyLogin: false,
        showLoginOverlay: true,
        silentLoginInitiated: false,
        executingLogout: false,
        showMustLoginOverlay: false,
        showLogoutOverlay: false,
        loginError: false,
    }
}

export const KeycloakConnectorContext = createContext<KeycloakConnectorContextProps | undefined>(undefined);
KeycloakConnectorContext.displayName = "KeycloakConnectorContext";

export const KeycloakConnectorDispatchContext = createContext<Dispatch<KeycloakConnectorStateActions> | undefined>(undefined);
KeycloakConnectorContext.displayName = "KeycloakConnectorDispatchContext";
