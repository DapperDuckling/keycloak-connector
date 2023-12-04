import type {UserStatus} from "@dapperduckling/keycloak-connector-common";
import {KeycloakConnectorClient} from "@dapperduckling/keycloak-connector-client";
import {ReactConfig} from "./components/KeycloakConnectorProvider.js";
import {ReactNode} from "react";

export interface AuthProps {
    children: ReactNode;
    reactConfig?: ReactConfig;
}
export interface KeycloakConnectorState {
    userStatus: UserStatus;
    hasAuthenticatedOnce: boolean;
    ui: {
        showLoginOverlay: boolean;
        showMustLoginOverlay: boolean;
        showLogoutOverlay: boolean;
        executingLogout: boolean;
        silentLoginInitiated: boolean;
        lengthyLogin: boolean;
        loginError: boolean;
    }
}

export enum KccDispatchType {
    DESTROY_CLIENT = "DESTROY_CLIENT",
    SET_KCC_CLIENT = "SET_KCC_CLIENT",
    KCC_CLIENT_EVENT = "KCC_CLIENT_EVENT",
    LENGTHY_LOGIN = "LENGTHY_LOGIN",
    SHOW_LOGIN = "SHOW_LOGIN",
    SHOW_LOGOUT = "SHOW_LOGOUT",
    EXECUTING_LOGOUT = "EXECUTING_LOGOUT",
    HIDE_DIALOG = "HIDE_DIALOG",
}

export type KeycloakConnectorStateActions =
    | { type: KccDispatchType.SET_KCC_CLIENT; payload: KeycloakConnectorClient; }
    | { type: KccDispatchType.KCC_CLIENT_EVENT; payload: Event | CustomEvent<UserStatus>; }
    | { type:
            KccDispatchType.DESTROY_CLIENT |
            KccDispatchType.LENGTHY_LOGIN |
            KccDispatchType.SHOW_LOGIN |
            KccDispatchType.SHOW_LOGOUT |
            KccDispatchType.EXECUTING_LOGOUT |
            KccDispatchType.HIDE_DIALOG
    }
