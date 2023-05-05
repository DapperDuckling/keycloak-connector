import type {CustomRouteUrl, KeycloakRouteConfig, UserData} from "./types.js";
import {RoleLocations} from "./types.js";

export const RouteUrlDefaults: CustomRouteUrl = {
    _prefix: '/auth',
    loginPage: '/login',
    loginPost: '/login',
    callback: '/callback',
    publicKeys: '/k_jwks',
}

export const RouteConfigDefault: KeycloakRouteConfig = {
    public: false,
    roles: [],
    autoRedirect: true,
}

export const UserDataDefault: UserData = {
    isAuthenticated: false,
    isAuthorized: false,
    roles: [],
}