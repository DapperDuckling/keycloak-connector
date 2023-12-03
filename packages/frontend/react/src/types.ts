import type {UserStatus} from "@dapperduckling/keycloak-connector-common";

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
