import type {GroupAuthConfig} from "../types.js";
import {AuthPluginManager, type KeycloakRouteConfigOrRoles} from "keycloak-connector-server";
import {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {RequestHandler} from "express-serve-static-core";

export class GroupAuthExpress {

    private constructor() {}


    private lock = (routeConfigOrRoles?: KeycloakRouteConfigOrRoles): RequestHandler => async (req, res, next) => {

    }

    public static init = async (registerAuthPlugin: AuthPluginManager['registerAuthPlugin'], groupAuthConfig: GroupAuthConfig)=> {
        const adapter = new this();

        const groupAuthPlugin = new GroupAuthPlugin(groupAuthConfig);
        await registerAuthPlugin(groupAuthPlugin);

        return {
            // groupAuth: // this should be a function folks can use
            ...groupAuthPlugin.exposedEndpoints()
        }
    }
}

export const groupAuthExpress = async (registerAuthPlugin: AuthPluginManager['registerAuthPlugin'], groupAuthConfig: GroupAuthConfig) => await GroupAuthExpress.init(registerAuthPlugin, groupAuthConfig);