import type {KeycloakRouteConfig, UserData} from "../types.js";


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
