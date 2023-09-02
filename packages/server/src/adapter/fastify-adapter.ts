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
    FastifyRequest,
    RawReplyDefaultExpression,
    RouteGenericInterface
} from "fastify";
import type {RawRequestDefaultExpression, RawServerDefault} from "fastify/types/utils.js";
import type {FastifyTypeProviderDefault} from "fastify/types/type-provider.js";
import type {FastifySchema} from "fastify/types/schema.js";
import type {FastifyBaseLogger} from "fastify/types/logger.js";
import type {fastifyStatic} from "@fastify/static";
import {RouteConfigDefault} from "../helpers/defaults.js";
import {isObject} from "../helpers/utils.js";

export type FastifyKeycloakInstance = FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, FastifyBaseLogger, FastifyTypeProviderDefault>;
export type KeycloakRequest = FastifyRequest<RouteGenericInterface, RawServerDefault, RawRequestDefaultExpression, FastifySchema, FastifyTypeProviderDefault, KeycloakRouteConfig, FastifyBaseLogger>
export class FastifyAdapter extends AbstractAdapter<SupportedServers.fastify> {

    private readonly fastify: FastifyKeycloakInstance;
    private readonly globalRouteConfig: KeycloakRouteConfig | undefined;
    constructor(fastify: FastifyKeycloakInstance, customConfig: KeycloakConnectorConfigCustom) {
        super();

        this.fastify = fastify;
        this.globalRouteConfig = {
            ...RouteConfigDefault,
            ...customConfig.globalRouteConfig
        };
    }

    public buildConnectorRequest = async (request: KeycloakRequest): Promise<ConnectorRequest> => ({
        ...request.headers?.origin && {origin: request.headers?.origin},
        url: request.url,
        cookies: request.cookies,
        headers: request.raw.headers,
        routeConfig: {
            ...this.globalRouteConfig,
            ...request.routeConfig,
        },
        ...request.keycloak && {keycloak: request.keycloak},
        ...isObject(request.body) && {body: request.body},
    });

    public async handleResponse(connectorResponse: ConnectorResponse<SupportedServers.fastify>, reply: FastifyReply): Promise<void> {

        // Set any cookies
        connectorResponse.cookies?.forEach(cookieParam => reply.setCookie(cookieParam.name, cookieParam.value, cookieParam.options));

        // Set the response code
        if (connectorResponse.statusCode) reply.code(connectorResponse.statusCode);

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
        async function routeHandler(this: FastifyAdapter, request: KeycloakRequest, reply: FastifyReply): Promise<FastifyReply> {
            const connectorReq = await this.buildConnectorRequest(request);
            const response = await connectorCallback(connectorReq);
            await this.handleResponse(response, reply);
            return reply;
        }

        // Register the route
        this.fastify.route({
            method: options.method,
            url: options.url,
            config: (options.isPublic) ? {
                public: true
            } : {
                public: false,
                roles: [],
            }, // sorry for the inline code, typescript was tripping otherwise...
            handler: routeHandler.bind(this),
        });

    }
}