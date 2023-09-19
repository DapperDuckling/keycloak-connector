import type {KeycloakConnectorInternalConfiguration, RefreshTokenSetResult} from "../types.js";

export abstract class AbstractTokenCache {

    protected abstract MAX_WAIT_SECS: number;
    protected static REFRESH_HOLDOVER_WINDOW_SECS = 60;
    protected configuration: KeycloakConnectorInternalConfiguration;

    constructor(configuration: KeycloakConnectorInternalConfiguration) {
        this.configuration = configuration;
    }

    public abstract refreshTokenSet(refreshJwt: string, accessJwt?: string): Promise<RefreshTokenSetResult | undefined>;
}