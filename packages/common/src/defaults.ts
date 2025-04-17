import type {CustomRouteUrl} from "./types.js";

export const RouteUrlDefaults: Required<CustomRouteUrl> = {
    _prefix: '/auth',
    loginPage: '/login',
    loginPost: '/login',
    loginListener: '/login-listener',
    logoutPage: '/logout',
    logoutPost: '/logout',
    callback: '/callback',
    logoutCallback: '/logout-callback',
    publicKeys: '/k-jwks',
    backChannelLogout: '/k-logout',
    userStatus: '/user-status',
    publicDir: "/static"
}
