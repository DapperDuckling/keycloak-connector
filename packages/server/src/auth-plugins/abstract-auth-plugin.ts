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
    protected abstract readonly internalConfig: AuthPluginInternalConfig;
    protected logger: Logger | undefined = undefined;

    protected constructor() {}

    //todo: better return handling
    public onRegister<T = undefined>(onRegisterConfig: AuthPluginOnRegisterConfig): T | undefined {
        this.logger = onRegisterConfig.logger;
        return undefined;
    }

    get config(): AuthPluginInternalConfig {
        return this.internalConfig;
    }

    abstract isAuthorized: IsUserAuthorized;
}