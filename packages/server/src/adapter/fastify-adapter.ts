import {AbstractAdapter, type ConnectorCallback, type RouteRegistrationOptions} from "./abstract-adapter.js";
import type {
    ConnectorRequest,
    ConnectorResponse,
    KeycloakConnectorConfigCustom,
    KeycloakRouteConfig,
    SupportedServers
} from "../types.js";
import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest
} from "fastify";
import type {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fastifyStatic
} from "@fastify/static";
import {RouteConfigDefault} from "../helpers/defaults.js";
import {isObject} from "../helpers/utils.js";

export class FastifyAdapter extends AbstractAdapter<SupportedServers.fastify> {

    private readonly fastify: FastifyInstance;
    private readonly globalRouteConfig: KeycloakRouteConfig | undefined;
    constructor(fastify: FastifyInstance, customConfig: KeycloakConnectorConfigCustom) {
        super();

        this.fastify = fastify;
        this.globalRouteConfig = {
            ...RouteConfigDefault,
            ...customConfig.globalRouteConfig
        };
    }

    public buildConnectorRequest = async (request: FastifyRequest): Promise<ConnectorRequest> => ({
        ...request.headers?.origin && {origin: request.headers?.origin},
        url: request.url,
        urlParams: request.params as Record<string, string>,
        cookies: request.cookies,
        headers: request.raw.headers,
        routeConfig: {
            ...this.globalRouteConfig,
            ...request.routeOptions.config,
        },
        ...request.kccUserData && {kccUserData: request.kccUserData},
        ...isObject(request.body) && {body: request.body},
    });

    public async handleResponse(connectorResponse: ConnectorResponse<SupportedServers.fastify>, reply: FastifyReply): Promise<void> {

        // Set any cookies
        connectorResponse.cookies?.forEach(cookieParam => reply.setCookie(cookieParam.name, cookieParam.value, cookieParam.options));

        // Set the response code
        if (connectorResponse.statusCode) void reply.code(connectorResponse.statusCode);

        // Handle exclusive parameters
        if (connectorResponse.redirectUrl) {
            // Redirect if needed
            return reply.redirect(connectorResponse.redirectUrl);

        } else if (connectorResponse.serveFile) {
            // Send any files
            return reply.sendFile(connectorResponse.serveFile);
        }

        return reply.send(connectorResponse.responseText ?? "");
    }

    registerRoute(options: RouteRegistrationOptions, connectorCallback: ConnectorCallback<SupportedServers.fastify>): void {

        // Build the route handler
        async function routeHandler(this: FastifyAdapter, request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
            const connectorReq = await this.buildConnectorRequest(request);
            const response = await connectorCallback(connectorReq);
            await this.handleResponse(response, reply);
            return reply;
        }

        // Build the route configuration
        const routeConfig: KeycloakRouteConfig = (options.isPublic) ? {
            public: true
        } : {
            public: false,
            roles: [],
        }

        // Register the route
        this.fastify.route({
            method: options.method,
            url: options.url,
            config: routeConfig,
            handler: routeHandler.bind(this),
        });

    }
}
