import type {CustomRouteUrl} from "./types.js";

export const RouteUrlDefaults: Required<CustomRouteUrl> = {
    _prefix: '/auth',
    loginPage: '/login',
    loginPost: '/login',
    loginListener: '/login-listener',
    logoutPage: '/logout',
    logoutPost: '/logout',
    callback: '/callback',
    logoutCallback: '/logout-callback', // Todo: Is this used?
    publicKeys: '/k-jwks',
    adminUrl: '/k-admin-url',
    backChannelLogout: '/k-logout',
    offlineToken: '/offline-token',
    userStatus: '/user-status',
    publicDir: "/static"
}
