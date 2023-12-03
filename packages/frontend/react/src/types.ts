import type {UserStatus} from "@dapperduckling/keycloak-connector-common";

export interface KeycloakConnectorState {
    userStatus: UserStatus;
    hasAuthenticatedOnce: boolean;
    showLoginOverlay: boolean;
    showMustLoginOverlay: boolean;
    showLogoutOverlay: boolean;
    executingLogout: boolean;
    silentLoginInitiated: boolean;
    lengthyLogin: boolean;
    loginError: boolean;
}
