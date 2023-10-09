import type {ConnectorRequest, UserData} from "../types.js";
import type {Logger} from "pino";
import {AuthPluginOverride} from "./auth-plugin-manager.js";

export type AuthPluginInternalConfig = {
    name: string,
    override?: AuthPluginOverride,
}

export type AuthPluginOnRegisterConfig = {
    logger?: Logger,
}

export type IsUserAuthorized = (connectorRequest: ConnectorRequest, userData: UserData, logger?: Logger) => Promise<boolean>;

export abstract class AbstractAuthPlugin {
    protected abstract readonly _internalConfig: AuthPluginInternalConfig;
    protected logger: Logger | undefined = undefined;

    protected constructor() {}

    public onRegister(onRegisterConfig: AuthPluginOnRegisterConfig) {
        this.logger = onRegisterConfig.logger?.child({"Source": `${this._internalConfig.name}`});
        return undefined;
    }

    get internalConfig(): AuthPluginInternalConfig {
        return this._internalConfig;
    }

    abstract isAuthorized: IsUserAuthorized;
    abstract exposedEndpoints: () => Record<string, any>;
}