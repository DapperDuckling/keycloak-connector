import type {ConnectorRequest, KeycloakConnectorConfigBase, UserData} from "../types.js";
import type {Logger} from "pino";
import {AuthPluginOverride} from "./auth-plugin-manager.js";

export type AuthPluginInternalConfig = {
    name: string,
    override?: AuthPluginOverride,
}

export type AuthPluginOnRegisterConfig = {
    keycloakConfig: KeycloakConnectorConfigBase,
    logger?: Logger,
}

export type DecorateResponse = (input: {connectorRequest: ConnectorRequest, userData: UserData, logger: Logger | undefined}) => Promise<Record<string, unknown>>;
export type DecorateUserStatus<UserStatus = Record<string, any>> = (connectorRequest: ConnectorRequest, logger: Logger | undefined) => Promise<Record<string, UserStatus>>;
export type DecorateUserStatusBackend<UserStatus = Record<string, any>> = (...args: Parameters<DecorateUserStatus<UserStatus>>) => Promise<UserStatus>;
export type IsUserAuthorized = (connectorRequest: ConnectorRequest, userData: UserData, logger?: Logger) => Promise<boolean>;

export abstract class AbstractAuthPlugin {
    protected abstract readonly _internalConfig: AuthPluginInternalConfig;
    protected logger: Logger | undefined = undefined;

    protected constructor() {}

    /**
     * Do not override
     * @param onRegisterConfig
     */
    public async onRegister(onRegisterConfig: AuthPluginOnRegisterConfig) {
        this.logger = onRegisterConfig.logger?.child({"Source": `${this._internalConfig.name}`});
        await this.onPluginRegister(onRegisterConfig);
        return undefined;
    }

    abstract onPluginRegister(onRegisterConfig: AuthPluginOnRegisterConfig): Promise<undefined>

    get internalConfig(): AuthPluginInternalConfig {
        return this._internalConfig;
    }

    abstract decorateRequestDefaults: DecorateResponse;
    abstract decorateUserStatus: DecorateUserStatus;
    abstract isAuthorized: IsUserAuthorized;
    abstract exposedEndpoints: () => Record<string, any>;
}
