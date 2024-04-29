import {AbstractAuthPlugin} from "../abstract-auth-plugin";

export interface GenericAuthConfig {
    onPluginRegister?: AbstractAuthPlugin['onPluginRegister'];
    decorateRequestDefaults?: AbstractAuthPlugin['decorateRequestDefaults'];
    decorateUserStatus?: AbstractAuthPlugin['decorateUserStatus'];
    isAuthorized: AbstractAuthPlugin['isAuthorized'];
    exposedEndpoints?: AbstractAuthPlugin['exposedEndpoints'];
}
