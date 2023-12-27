import type {FastifyPluginAsync, RouteGenericInterface} from "fastify";
import {KeycloakConnector} from "../keycloak-connector.js";
import type {
    KeycloakConnectorConfigCustom,
    UserData,
    SupportedServers
} from "../types.js";
import {fastifyPlugin} from "fastify-plugin";
import {FastifyAdapter} from "./fastify-adapter.js";
import type {Logger} from "pino";
import type {KeycloakRouteConfigFastify} from "./fastify-types.js";

const keycloakConnectorFastifyPlugin: FastifyPluginAsync<KeycloakConnectorConfigCustom> = async (fastify, customConfig): Promise<void> => {

    // Create a Fastify specific adapter
    const adapter = new FastifyAdapter(fastify, customConfig);

    // Add pino logger
    if (fastify.log) customConfig.pinoLogger = fastify.log as Logger;

    // Initialize the keycloak connector
    const kcc = await KeycloakConnector.init<SupportedServers.fastify>(adapter, customConfig);

    // Check if we need to add a content parser for form submissions
    if (!fastify.hasContentTypeParser('application/x-www-form-urlencoded')) {
        // Log that we are adding a basic handler. Developers should use their own if they need something more robust.
        kcc.config.pinoLogger?.warn(`No handler for content type "application/x-www-form-urlencoded". Adding extremely generic handler in order to accept POSTS from HTML forms.`);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - `FastifyContentTypeParser` defines the type below, but typescript isn't seeing it.
        fastify.addContentTypeParser('application/x-www-form-urlencoded', async () => undefined);
    }

    // Decorate the fastify instance with keycloak
    fastify.decorate('kcc', kcc.getExposed());

    // Add keycloak data to the request params
    fastify.decorateRequest<UserData | null>('kccUserData', null);
    fastify.addHook<RouteGenericInterface, KeycloakRouteConfigFastify>('onRequest', async function(request, reply) {

        // Ignore 404 routes
        if (request.is404) return;

        // Ignore bypass all check routes
        if (request.routeOptions.config.bypassAllChecks) return;

        // Grab user data
        const connectorReq = await adapter.buildConnectorRequest(request);
        const userDataResponse = await kcc.getUserData(connectorReq);

        // Set any cookies from user data response
        userDataResponse.cookies?.forEach(cookieParam => reply.setCookie(cookieParam.name, cookieParam.value, cookieParam.options));

        // Store the user data
        request.kccUserData = userDataResponse.userData;

        // Decorate the request with the decorators from the plugins
        Object.entries(connectorReq.pluginDecorators ?? {}).forEach(([key, value]) => request[key] = value);

        // Grab the protector response
        const connectorResponse = await kcc.buildRouteProtectionResponse(connectorReq, request.kccUserData);

        // Handle the response
        if (connectorResponse) {
            await adapter.handleResponse(connectorResponse, reply);
        }
    });

}

export const keycloakConnectorFastify = (encapsulate: boolean = false) => {
    return fastifyPlugin(keycloakConnectorFastifyPlugin, {
        fastify: '4.x',
        name: 'keycloak-connector-server',
        decorators: {
            request: ['cookies'],
        },
        dependencies: ['@fastify/cookie'],
        encapsulate: encapsulate,
    });
};
