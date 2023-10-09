import type {IsUserAuthorized} from "./abstract-auth-plugin.js";
import {AbstractAuthPlugin} from "./abstract-auth-plugin.js";
import type {ConnectorRequest, UserData} from "../types.js";
import type {Logger} from "pino";

export enum AuthPluginOverride {
    DISABLE_BASE_FUNCTION,  // Used to make this plugin play with all other plugins (excluding the base function)
    OVERRIDE_NONE,          // Used to make this plugin play with all other plugins (including the base function)
    OVERRIDE_ALL,           // Used to force this plugin to be the only available plugin
}

export class AuthPluginManager {

    private readonly plugins = new Map<string, AbstractAuthPlugin>();
    private readonly baseHandler: IsUserAuthorized;
    private readonly logger: Logger | undefined;
    private maxOverrideConfig = AuthPluginOverride.OVERRIDE_NONE;

    // Make this un-extendable
    private constructor(baseHandler: IsUserAuthorized, logger?: Logger) {
        this.baseHandler = baseHandler;
        this.logger = logger;
    }

    private registerAuthPlugin = (plugin: AbstractAuthPlugin) => {

        // Check if this plugin is already registered
        if (this.plugins.has(plugin.config.name)) {
            throw new Error(`Plugin with name "${plugin.config.name}" already registered. Cannot register again`);
        }

        // Check if there is already an override all plugin registered
        if (this.maxOverrideConfig === AuthPluginOverride.OVERRIDE_ALL) {
            throw new Error(`Cannot register plugin with name "${plugin.config.name}" when another plugin is already registered to OVERRIDE_ALL`);
        }

        // Check if this plugin is overriding all and other plugins are registered
        if (plugin.config.override === AuthPluginOverride.OVERRIDE_ALL && this.plugins.size !== 0) {
            throw new Error(`Cannot register plugin with name "${plugin.config.name}" that will OVERRIDE_ALL when other plugins have already been registered`);
        }

        // Update max override config
        if (plugin.config.override) {
            switch (this.maxOverrideConfig) {
                case AuthPluginOverride.DISABLE_BASE_FUNCTION:
                    if (plugin.config.override === AuthPluginOverride.OVERRIDE_ALL) {
                        this.maxOverrideConfig = AuthPluginOverride.OVERRIDE_ALL;
                    }
                    break;
                case AuthPluginOverride.OVERRIDE_NONE:
                    this.maxOverrideConfig = plugin.config.override;
                    break;
            }
        }

        return plugin.onRegister({
            ...this.logger && {logger: this.logger}
        });

        // return {
        //     groupAuth:
        //     groupAuthCheck:
        // groupAuthConfig:
        //     }
    }

    public isUserAuthorized: IsUserAuthorized = async (connectorRequest: ConnectorRequest, userData: UserData): Promise<boolean> => {

        const isAuthorizedResponses: unknown[] = [];

        // Loop through plugins
        for (const [name, plugin] of this.plugins.entries()) {
            try {
                // Grab the result from the plugin, but do not trust they are returning a boolean
                const pluginResult = await plugin.isAuthorized(connectorRequest, userData) as unknown;

                // Store the result
                isAuthorizedResponses.push(pluginResult);
            } catch (e) {
                throw new Error(`Issue invoking isAuthorized from auth plugin ${name}`);
            }
        }

        // Run the base handler
        if (this.maxOverrideConfig === AuthPluginOverride.OVERRIDE_NONE) {
            const baseResult = this.baseHandler(connectorRequest, userData);
            isAuthorizedResponses.push(baseResult);
        }

        // Check if all responses are authorizing
        return isAuthorizedResponses.every(response => response === true);
    }

    static init = (baseHandler: IsUserAuthorized, logger: Logger | undefined) => new AuthPluginManager(baseHandler, logger);
}