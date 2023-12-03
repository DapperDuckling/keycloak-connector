import type { ImmerReducer } from "use-immer";
import type {KeycloakConnectorContextProps} from "./keycloak-connector-context.js";
import type {UserStatus} from "@dapperduckling/keycloak-connector-common";
import {ClientEvent, KeycloakConnectorClient} from "@dapperduckling/keycloak-connector-client";
import {initialContext} from "./keycloak-connector-context.js";

export enum KccDispatchType {
    SET_KCC_CLIENT = "SET_KCC_CLIENT",
    KCC_CLIENT_EVENT = "KCC_CLIENT_EVENT",
    LENGTHY_LOGIN = "LENGTHY_LOGIN",
    SHOW_LOGOUT = "SHOW_LOGOUT",
    EXECUTING_LOGOUT = "EXECUTING_LOGOUT",
}

export type KeycloakConnectorStateActions =
    | { type: KccDispatchType.SET_KCC_CLIENT; payload: KeycloakConnectorClient; }
    | { type: KccDispatchType.KCC_CLIENT_EVENT; payload: Event | CustomEvent<UserStatus>; }
    | { type:
        KccDispatchType.LENGTHY_LOGIN   |
        KccDispatchType.SHOW_LOGOUT     |
        KccDispatchType.EXECUTING_LOGOUT
    }

type ImmerReducerType = ImmerReducer<KeycloakConnectorContextProps, KeycloakConnectorStateActions>;

const keycloakConnectorClientEventHandler: ImmerReducerType = (draft, action) => {
    // Ensure the correct payload was passed
    if (action.type !== KccDispatchType.KCC_CLIENT_EVENT) return;

    //todo: need to create a function here to provide a "reset" login window state for the below events

    const eventType = action.payload.type as ClientEvent;
    switch (eventType) {
        case ClientEvent.INVALID_TOKENS:
            draft.showLoginOverlay = true;
            break;
        case ClientEvent.START_SILENT_LOGIN:
            draft.silentLoginInitiated = true;
            break;
        case ClientEvent.LOGIN_ERROR:
            draft.loginError = true;
            break;
        case ClientEvent.LOGOUT_SUCCESS:
            // Reset the state
            return structuredClone(initialContext);

        case ClientEvent.USER_STATUS_UPDATED:
            const payload = action.payload as CustomEvent<UserStatus>;
            draft.userStatus = payload.detail;
            draft.showLoginOverlay = draft.showMustLoginOverlay = !payload.detail.loggedIn;
            draft.hasAuthenticatedOnce = draft.hasAuthenticatedOnce || payload.detail.loggedIn;
            break;
    }

    return undefined;
}

export const reducer: ImmerReducerType = (draft, action) => {
    switch (action.type) {
        case KccDispatchType.KCC_CLIENT_EVENT:
            keycloakConnectorClientEventHandler(draft, action);
            break;
        case KccDispatchType.SET_KCC_CLIENT:
            draft.kccClient = action.payload;
            break;
        case KccDispatchType.LENGTHY_LOGIN:
            draft.lengthyLogin = true;
            break;
        case KccDispatchType.EXECUTING_LOGOUT:
            draft.showLogoutOverlay = true;
            draft.executingLogout = true;
            break;
        case KccDispatchType.SHOW_LOGOUT:
            draft.showLogoutOverlay = true;
            break;
    }
}
