import {GenericAuthPlugin} from "./generic-auth-plugin.js";
import type {Express} from "express";
import {AuthPluginManager} from "../auth-plugin-manager.js";
import {GenericAuthConfig} from "./types.js";

const genericAuthExpressPlugin = async (app: Express, registerAuthPlugin: AuthPluginManager['registerAuthPlugin'], config: GenericAuthConfig) => {
    // Register the plugin
    const genericAuthPlugin = new GenericAuthPlugin(config);
    await registerAuthPlugin(genericAuthPlugin);

    return {
        ...genericAuthPlugin.exposedEndpoints()
    }
}

export const genericAuthExpress = async (...args: Parameters<typeof genericAuthExpressPlugin>) => await genericAuthExpressPlugin(...args);
