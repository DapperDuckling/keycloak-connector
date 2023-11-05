import type {GroupAuthConfig} from "../types.js";
import {AuthPluginManager} from "keycloak-connector-server";
import {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {RequestHandler} from "express-serve-static-core";
import {groupAuth as groupAuthOriginal} from "../group-auth-builder.js";

export const groupAuth = (...args: Parameters<typeof groupAuthOriginal>): RequestHandler => {
    const {group, groupAuthConfig} = groupAuthOriginal(...args);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return async (req, res, next) => {
        //todo: handle request

        // @ts-ignore
        req.idc = "sup dawg";
    };
}

const groupAuthExpressPlugin = async (registerAuthPlugin: AuthPluginManager['registerAuthPlugin'], groupAuthConfig: GroupAuthConfig) => {
    // Register the plugin
    const groupAuthPlugin = new GroupAuthPlugin(groupAuthConfig);
    await registerAuthPlugin(groupAuthPlugin);

    return {
        ...groupAuthPlugin.exposedEndpoints()
    }
}

export const groupAuthExpress = async (registerAuthPlugin: AuthPluginManager['registerAuthPlugin'], groupAuthConfig: GroupAuthConfig) => await groupAuthExpressPlugin(registerAuthPlugin, groupAuthConfig);
