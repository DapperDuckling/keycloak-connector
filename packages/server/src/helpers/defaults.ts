import type {CustomRouteUrl, KeycloakRouteConfig, UserData} from "../types.js";

export const RouteUrlDefaults: Required<CustomRouteUrl> = {
    _prefix: '/auth',
    loginPage: '/login',
    loginPost: '/login',
    logoutPage: '/logout',
    logoutPost: '/logout',
    callback: '/callback',
    logoutCallback: '/logout-callback', // Todo: Is this used?
    publicKeys: '/k-jwks',
    adminUrl: '/k-admin-url',
    backChannelLogout: '/k-logout',
    userStatus: '/user-status',
    publicDir: "/:file"
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
