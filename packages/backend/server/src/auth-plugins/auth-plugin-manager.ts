import type {DecorateResponse, IsUserAuthorized} from "./abstract-auth-plugin.js";
import {AbstractAuthPlugin} from "./abstract-auth-plugin.js";
import type {ConnectorRequest, KeycloakConnectorConfigBase, UserData} from "../types.js";
import type {Logger} from "pino";

export enum AuthPluginOverride {
    DISABLE_BASE_FUNCTION,  // Used to make this plugin play with all other plugins (excluding the base function)
    OVERRIDE_NONE,          // Used to make this plugin play with all other plugins (including the base function)
    OVERRIDE_ALL,           // Used to force this plugin to be the only available plugin
}

interface AuthPluginManagerConfig {
    baseHandler: IsUserAuthorized;
    keycloakConfig: KeycloakConnectorConfigBase;
    logger?: Logger;
}

export class AuthPluginManager {

    private readonly plugins = new Map<string, AbstractAuthPlugin>();
    private readonly baseHandler: IsUserAuthorized;
    private readonly logger: Logger | undefined;
    private readonly keycloakConfig: KeycloakConnectorConfigBase;
    private maxOverrideConfig = AuthPluginOverride.OVERRIDE_NONE;

    // Make this un-extendable
    private constructor(config: AuthPluginManagerConfig) {
        this.baseHandler = config.baseHandler;
        this.keycloakConfig = config.keycloakConfig;
        this.logger = config.logger;
    }

    public registerAuthPlugin = async (plugin: AbstractAuthPlugin) => {

        // Check if this plugin is already registered
        if (this.plugins.has(plugin.internalConfig.name)) {
            throw new Error(`Plugin with name "${plugin.internalConfig.name}" already registered. Cannot register again`);
        }

        // Check if there is already an override all plugin registered
        if (this.maxOverrideConfig === AuthPluginOverride.OVERRIDE_ALL) {
            throw new Error(`Cannot register plugin with name "${plugin.internalConfig.name}" when another plugin is already registered to OVERRIDE_ALL`);
        }

        // Check if this plugin is overriding all and other plugins are registered
        if (plugin.internalConfig.override === AuthPluginOverride.OVERRIDE_ALL && this.plugins.size !== 0) {
            throw new Error(`Cannot register plugin with name "${plugin.internalConfig.name}" that will OVERRIDE_ALL when other plugins have already been registered`);
        }

        // Update max override config
        if (plugin.internalConfig.override !== undefined) {
            switch (this.maxOverrideConfig) {
                case AuthPluginOverride.DISABLE_BASE_FUNCTION:
                    if (plugin.internalConfig.override === AuthPluginOverride.OVERRIDE_ALL) {
                        this.maxOverrideConfig = AuthPluginOverride.OVERRIDE_ALL;
                    }
                    break;
                case AuthPluginOverride.OVERRIDE_NONE:
                    this.maxOverrideConfig = plugin.internalConfig.override;
                    break;
            }
        }

        // Add to the plugin list
        this.plugins.set(plugin.internalConfig.name, plugin);

        return await plugin.onRegister({
            keycloakConfig: this.keycloakConfig,
            ...this.logger && {logger: this.logger}
        });

        // return {
        //     groupAuths:
        //     groupAuthCheck:
        // groupAuthConfig:
        //     }
    }

    public decorateRequestDefaults = async (connectorRequest: ConnectorRequest, userData: UserData): Promise<void> => {
        // Loop through plugins
        for (const [name, plugin] of this.plugins.entries()) {
            try {
                const decorators = await plugin.decorateRequestDefaults({connectorRequest, userData, logger: this.logger});
                Object.entries(decorators).forEach(([key, value]) => connectorRequest.pluginDecorators![key] = value);
            } catch (e) {
                throw new Error(`Issue invoking decorateRequestDefaults from auth plugin ${name}`);
            }
        }
    }

    public decorateUserStatus = async (connectorRequest: ConnectorRequest): Promise<Record<string, any>> => {
        let userStatus = {}

        // Loop through the plugins
        for (const [name, plugin] of this.plugins.entries()) {
            try {
                userStatus = {
                    ...userStatus,
                    ...await plugin.decorateUserStatus(connectorRequest, this.logger),
                }
            } catch (e) {
                throw new Error(`Issue invoking decorateUserStatus from auth plugin ${name}`);
            }
        }

        return userStatus;
    }

    public isUserAuthorized: IsUserAuthorized = async (connectorRequest: ConnectorRequest, userData: UserData): Promise<boolean> => {

        const isAuthorizedResponses: boolean[] = [];

        // Loop through plugins
        for (const [name, plugin] of this.plugins.entries()) {
            try {
                // Grab the result from the plugin, but do not trust they are returning a boolean
                const pluginResult = await plugin.isAuthorized(connectorRequest, userData);

                // Store the result
                isAuthorizedResponses.push(pluginResult);
            } catch (e) {
                throw new Error(`Issue invoking isAuthorized from auth plugin ${name}`);
            }
        }

        // Run the base handler
        if (this.maxOverrideConfig === AuthPluginOverride.OVERRIDE_NONE) {
            const baseResult = await this.baseHandler(connectorRequest, userData);
            isAuthorizedResponses.push(baseResult);
        }

        // Check if all responses are authorizing
        return isAuthorizedResponses.every(response => response);
    }

    static init = (config: AuthPluginManagerConfig) => new AuthPluginManager(config);
}
