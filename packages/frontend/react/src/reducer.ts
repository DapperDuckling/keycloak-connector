import type { ImmerReducer } from "use-immer";
import type {KeycloakConnectorContextProps} from "./keycloak-connector-context.js";
import type {UserStatus} from "@dapperduckling/keycloak-connector-common";
import {ClientEvent, KeycloakConnectorClient} from "@dapperduckling/keycloak-connector-client";
// import {initialContext} from "./keycloak-connector-context.js";

export enum KccDispatch {
    SET_KCC_CLIENT,
    KCC_CLIENT_EVENT,
    LENGTHY_LOGIN,
}

export type KeycloakConnectorStateActions =
    | { type: KccDispatch.SET_KCC_CLIENT; payload: KeycloakConnectorClient; }
    | { type: KccDispatch.KCC_CLIENT_EVENT; payload: Event | CustomEvent<UserStatus>; }
    | { type: KccDispatch.LENGTHY_LOGIN; }

type ImmerReducerType = ImmerReducer<KeycloakConnectorContextProps, KeycloakConnectorStateActions>;

const keycloakConnectorClientEventHandler: ImmerReducerType = (draft, action) => {
    // Ensure the correct payload was passed
    if (action.type !== KccDispatch.KCC_CLIENT_EVENT) return;

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
            // return structuredClone(initialContext);

        case ClientEvent.USER_STATUS_UPDATED:
            const payload = action.payload as CustomEvent<UserStatus>;
            draft.userStatus = payload.detail;
            break;
    }

    return undefined;
}

// export const reducer: ImmerReducerType = (draft, action) => {
// @ts-ignore
export const reducer = (draft, action) => {
    switch (action.type) {
        case KccDispatch.KCC_CLIENT_EVENT:
            keycloakConnectorClientEventHandler(draft, action);
            break;
        case KccDispatch.SET_KCC_CLIENT:
            draft.kccClient = action.payload;
            break;
        case KccDispatch.LENGTHY_LOGIN:
            draft.lengthyLogin = true;
            break;
    }
}
