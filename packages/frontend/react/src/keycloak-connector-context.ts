import {createContext, Dispatch} from "react";
import {KeycloakConnectorClient} from "@dapperduckling/keycloak-connector-client";
import type {KeycloakConnectorState, KeycloakConnectorStateActions} from "./types.js";

export interface KeycloakConnectorContextProps extends KeycloakConnectorState {
    kccClient?: KeycloakConnectorClient,
}

export const InitialContext: KeycloakConnectorContextProps = {
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
        hasInvalidTokens: false,
    }
}

export const KeycloakConnectorContext = createContext<KeycloakConnectorContextProps | undefined>(undefined);
KeycloakConnectorContext.displayName = "KeycloakConnectorContext";

export const KeycloakConnectorDispatchContext = createContext<Dispatch<KeycloakConnectorStateActions> | undefined>(undefined);
KeycloakConnectorContext.displayName = "KeycloakConnectorDispatchContext";
