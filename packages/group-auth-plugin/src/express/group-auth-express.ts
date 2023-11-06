import type {GroupAuthConfig, GroupAuthRouteConfig} from "../types.js";
import {AuthPluginManager, lock} from "keycloak-connector-server";
import {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {RequestHandler} from "express-serve-static-core";
import {groupAuth as groupAuthOriginal} from "../group-auth-builder.js";
import type {Express} from "express";

export const groupAuth = (...args: Parameters<typeof groupAuthOriginal>): RequestHandler => {
    // const {group, groupAuthConfig} = groupAuthOriginal(...args);
    const groupAuthRouteConfig = groupAuthOriginal(...args);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    return async (...args) => {
        // Extract the req object
        const [req] = args;

        // must check that the group auth plugin is even registered.
        if (req.kccGroupAuthPlugin === undefined) {
            throw new Error(`Group auth plugin is not registered!`);
        }

        // Pass request to the adapter handler
        await req.kccAdapter.onRequest<GroupAuthRouteConfig>(groupAuthRouteConfig, ...args);
    };
}

const groupAuthExpressPlugin = async (app: Express, registerAuthPlugin: AuthPluginManager['registerAuthPlugin'], groupAuthConfig: GroupAuthConfig) => {
    // Register the plugin
    const groupAuthPlugin = new GroupAuthPlugin(groupAuthConfig);
    await registerAuthPlugin(groupAuthPlugin);

    // Decorate all requests with the adapter
    app.use((req, res, next) => {
       // Ensure multiple adapters are not registered
       if (req.kccGroupAuthPlugin) {
           throw new Error(`Cannot register multiple group auth plugins on the same server!`);
       }

       req.kccGroupAuthPlugin = groupAuthPlugin;
       next();
    });

    return {
        ...groupAuthPlugin.exposedEndpoints()
    }
}

export const groupAuthExpress = async (...args: Parameters<typeof groupAuthExpressPlugin>) => await groupAuthExpressPlugin(...args);
