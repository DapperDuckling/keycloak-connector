import type {ConnectorRequest, ConnectorResponse, HTTPMethod, SupportedServers} from "../types.js";

export type ConnectorCallback<Server extends SupportedServers> = (connectorReq: ConnectorRequest) => Promise<ConnectorResponse<Server>>;
export interface RouteRegistrationOptions {
    method: HTTPMethod,
    url: string,
    isPublic: boolean,
}
export abstract class AbstractAdapter<Server extends SupportedServers> {

    protected abstract buildConnectorRequest(request: never): Promise<ConnectorRequest>;
    protected abstract handleResponse(connectorResponse: ConnectorResponse<Server>, ...args: never): Promise<void>;

    abstract registerRoute(
        options: RouteRegistrationOptions,
        callback: ConnectorCallback<Server>,
    ): void;
}