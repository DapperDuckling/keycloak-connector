import {AbstractAdapter, type ConnectorCallback, type RouteRegistrationOptions} from "./abstract-adapter.js";
import type {
    ConnectorRequest,
    ConnectorResponse,
    KeycloakConnectorConfigCustom,
    SupportedServers,
} from "../types.js";
import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest
} from "fastify";
import {
    fastifyStatic
} from "@fastify/static";
import {RouteConfigDefault} from "../helpers/defaults.js";
import { dirname } from "path";
import { basename } from "path";
import type {KeycloakRouteConfigFastify} from "./fastify-types.js";
import { isObject } from "@dapperduckling/keycloak-connector-common";

export class FastifyAdapter extends AbstractAdapter<SupportedServers.fastify> {

    private readonly fastify: FastifyInstance;
    private readonly globalRouteConfig: KeycloakRouteConfigFastify | undefined;
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
        urlQuery: request.query as Record<string, unknown>,
        cookies: request.cookies,
        headers: request.raw.headers,
        pluginDecorators: {},
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

        // Set the response headers
        Object.entries(connectorResponse.headers ?? {}).forEach(([key, value]) => reply.header(key, value));

        // Handle exclusive parameters
        if (connectorResponse.redirectUrl) {
            // Redirect if needed
            return reply.redirect(connectorResponse.redirectUrl);

        } else if (connectorResponse.serveFileFullPath) {
            // Send any files
            return reply.sendFile(
                basename(connectorResponse.serveFileFullPath),
                dirname(connectorResponse.serveFileFullPath),
                {
                    serveDotFiles: false,
                }
            );
        }

        // Check if this is an html response
        if (connectorResponse.responseHtml !== undefined) {
            // Add content type header
            reply.header("Content-Type", "text/html");
        }

        return reply.send(connectorResponse.responseHtml ?? connectorResponse.responseText ?? "");
    }

    registerRoute(options: RouteRegistrationOptions, connectorCallback: ConnectorCallback<SupportedServers.fastify>): void {

        // Handle static routes separately
        if (options.serveStaticOptions) {
            this.fastify.register(fastifyStatic, {
                root: options.serveStaticOptions.root,
                index: false,
                serveDotFiles: false,
                serve: false,
            });

            this.fastify.all(`${options.url}/*`, {config: {bypassAllChecks: true}}, function (req, reply) {
                // @ts-ignore
                let requestedFile = req.params["*"] ?? "";
                if (requestedFile === "") requestedFile = options.serveStaticOptions.index ?? "";
                reply.sendFile(requestedFile);
            })
            return;
        }

        // Build the route handler
        async function routeHandler(this: FastifyAdapter, request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
            const connectorReq = await this.buildConnectorRequest(request);
            const response = await connectorCallback(connectorReq);
            await this.handleResponse(response, reply);
            return reply;
        }

        // Build the route configuration
        const routeConfig: KeycloakRouteConfigFastify = (options.isUnlocked) ? {
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
