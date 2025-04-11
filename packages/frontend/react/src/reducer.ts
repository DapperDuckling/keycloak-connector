import type {ImmerReducer} from "use-immer";
import type {KeycloakConnectorContextProps} from "./keycloak-connector-context.js";
import {InitialContext} from "./keycloak-connector-context.js";
import type {UserStatusImmerSafe} from "@dapperduckling/keycloak-connector-common";
import {ClientEvent} from "@dapperduckling/keycloak-connector-client";
import {Draft} from "immer";
import {KccDispatchType, KeycloakConnectorStateActions} from "./types.js";

type ImmerReducerType = ImmerReducer<KeycloakConnectorContextProps, KeycloakConnectorStateActions>;

const resetUiHelperStates = (draft: Draft<KeycloakConnectorContextProps>) => {
    draft.ui.silentLoginInitiated = draft.ui.lengthyLogin = draft.ui.loginError = false;
}

const keycloakConnectorClientEventHandler: ImmerReducerType = (draft, action) => {
    // Ensure the correct payload was passed
    if (action.type !== KccDispatchType.KCC_CLIENT_EVENT) return;

    const eventType = action.payload.type as ClientEvent;
    switch (eventType) {
        case ClientEvent.INVALID_TOKENS:
            draft.ui.showLoginOverlay = true;
            draft.ui.hasInvalidTokens = true;
            break;
        case ClientEvent.START_SILENT_LOGIN:
            draft.ui.silentLoginInitiated = true;
            draft.ui.loginError = false;
            break;
        case ClientEvent.LOGIN_ERROR:
            draft.ui.loginError = true;
            draft.ui.silentLoginInitiated = false;
            break;
        case ClientEvent.LOGOUT_SUCCESS:
            // Reset the state
            return structuredClone(InitialContext);

        case ClientEvent.USER_STATUS_UPDATED:
            const payload = action.payload as CustomEvent<UserStatusImmerSafe>;
            draft.userStatus = payload.detail;
            if (payload.detail.loggedIn) draft.ui.hasInvalidTokens = false;
            resetUiHelperStates(draft);
            draft.ui.showLoginOverlay = draft.ui.showMustLoginOverlay = !payload.detail.loggedIn;   // Show hide the overlay and must log in
            draft.hasAuthenticatedOnce = draft.hasAuthenticatedOnce || payload.detail.loggedIn;     // Potentially set the auth once flag
            break;
    }

    return undefined;
}

export const reducer: ImmerReducerType = (draft, action) => {
    switch (action.type) {
        case KccDispatchType.KCC_CLIENT_EVENT:
            return keycloakConnectorClientEventHandler(draft, action);
        case KccDispatchType.SET_KCC_CLIENT:
            draft.kccClient = action.payload;
            break;
        case KccDispatchType.LENGTHY_LOGIN:
            draft.ui.lengthyLogin = true;
            break;
        case KccDispatchType.EXECUTING_LOGOUT:
            draft.ui.showLogoutOverlay = true;
            draft.ui.executingLogout = true;
            break;
        case KccDispatchType.SHOW_LOGIN:
            draft.ui.showLoginOverlay = true;
            break;
        case KccDispatchType.SHOW_LOGOUT:
            draft.ui.showLogoutOverlay = true;
            break;
        case KccDispatchType.HIDE_DIALOG:
            resetUiHelperStates(draft);
            draft.ui.showLoginOverlay = false;
            draft.ui.showLogoutOverlay = false;
            break;
        case KccDispatchType.DESTROY_CLIENT:
            return structuredClone(InitialContext);
    }

    return undefined;
}
