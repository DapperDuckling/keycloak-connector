import type {ConnectorRequest, ConnectorResponse, HTTPMethod, SupportedServers} from "../types.js";

export type ConnectorCallback<Server extends SupportedServers> = (connectorReq: ConnectorRequest) => Promise<ConnectorResponse<Server>>;
type BaseRouteRegistrationOptions = {
    method: HTTPMethod,
    url: string,
}
type DynamicRouteRegistrationOptions = BaseRouteRegistrationOptions & {
    isUnlocked: boolean,
    serveStaticOptions?: undefined,
}
type StaticRouteRegistrationOptions = BaseRouteRegistrationOptions & {
    isUnlocked: true,
    serveStaticOptions: {
        root: string,
        index?: string | false | undefined,
    },
}
export type RouteRegistrationOptions = DynamicRouteRegistrationOptions | StaticRouteRegistrationOptions;

export abstract class AbstractAdapter<Server extends SupportedServers> {

    public abstract buildConnectorRequest(request: never, ...args: never): Promise<ConnectorRequest>;
    public abstract handleResponse(connectorResponse: ConnectorResponse<Server>, ...args: never): Promise<void>;

    abstract registerRoute(
        options: RouteRegistrationOptions,
        connectorCallback: ConnectorCallback<Server>,
    ): void;
}
