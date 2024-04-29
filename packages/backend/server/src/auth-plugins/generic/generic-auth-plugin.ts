import {
    AbstractAuthPlugin,
    type AuthPluginInternalConfig,
    type AuthPluginOnRegisterConfig,
    AuthPluginOverride,
    type ConnectorRequest,
    type DecorateResponse,
    type DecorateUserStatus,
    type IsUserAuthorized,
    type UserData
} from "../../index";
import type {Logger} from "pino";
import {GenericAuthConfig} from "./types.js";

export class GenericAuthPlugin extends AbstractAuthPlugin {
    protected override _internalConfig: AuthPluginInternalConfig = {
        name: 'GenericAuthPlugin',
        override: AuthPluginOverride.OVERRIDE_NONE
    }

    private readonly config: GenericAuthConfig;

    constructor(config: GenericAuthConfig) {
        super();

        this.config = config;
    }

    override onPluginRegister = async (onRegisterConfig: AuthPluginOnRegisterConfig): Promise<undefined> =>
        await this.config.onPluginRegister?.(onRegisterConfig);

    override decorateRequestDefaults: DecorateResponse = async (input) =>
        await this.config.decorateRequestDefaults?.(input) ?? ({});

    override decorateUserStatus: DecorateUserStatus = async (connectorRequest, logger) =>
        await this.config.decorateUserStatus?.(connectorRequest, logger) ?? ({});

    override isAuthorized: IsUserAuthorized = async (connectorRequest: ConnectorRequest, userData: UserData, logger?: Logger) => {

        const isAuthorized = await this.config.isAuthorized?.(connectorRequest, userData, logger);

        if (isAuthorized !== true && isAuthorized !== false) {
            logger?.error(`${this._internalConfig.name} did not isAuthorized function did not return true or false`);
            return false;
        }

        logger?.debug(`${this._internalConfig.name} reports request is authorized? ${isAuthorized}`);
        return isAuthorized;

    }

    override exposedEndpoints = () => this.config.exposedEndpoints?.() ?? ({});

}
