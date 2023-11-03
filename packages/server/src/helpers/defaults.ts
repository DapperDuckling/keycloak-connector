import type {CustomRouteUrl, KeycloakRouteConfig, UserData} from "../types.js";

export const RouteUrlDefaults: CustomRouteUrl = {
    _prefix: '/auth',
    loginPage: '/login',
    loginPost: '/login',
    logoutPage: '/logout',
    logoutPost: '/logout',
    callback: '/callback',
    publicKeys: '/k_jwks',
    adminUrl: '/k_admin_url',
    backChannelLogout: '/k_logout',
    loginStatus: '/login_status',
}

export const RouteConfigDefault: KeycloakRouteConfig = {
    public: false,
    roles: [],
    autoRedirect: true,
}

export const UserDataDefault: UserData = {
    isAuthenticated: false,
    isAuthorized: false,
    // roles: [],
}
