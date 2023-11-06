import type {ConnectorRequest, ConnectorResponse, HTTPMethod, SupportedServers} from "../types.js";

export type ConnectorCallback<Server extends SupportedServers> = (connectorReq: ConnectorRequest) => Promise<ConnectorResponse<Server>>;
export interface RouteRegistrationOptions {
    method: HTTPMethod,
    url: string,
    isPublic: boolean,
}
export abstract class AbstractAdapter<Server extends SupportedServers> {

    public abstract buildConnectorRequest(request: never, ...args: never): Promise<ConnectorRequest>;
    public abstract handleResponse(connectorResponse: ConnectorResponse<Server>, ...args: never): Promise<void>;

    abstract registerRoute(
        options: RouteRegistrationOptions,
        connectorCallback: ConnectorCallback<Server>,
    ): void;
}
