import type {FastifyPluginAsync, FastifyRequest, RouteGenericInterface} from "fastify";
import {KeycloakConnector} from "../keycloak-connector.js";
import type {
    KeycloakConnectorConfigCustom,
    UserData,
    KeycloakRouteConfig,
    SupportedServers
} from "../types.js";
import {fastifyPlugin} from "fastify-plugin";
import {FastifyAdapter} from "./fastify-adapter.js";
import type {Logger} from "pino";

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
        fastify.addContentTypeParser('application/x-www-form-urlencoded', async (request, payload) => undefined);
    }

    // Add keycloak data to the request params
    fastify.decorateRequest<UserData | null>('keycloak', null);
    fastify.addHook<RouteGenericInterface, KeycloakRouteConfig>('onRequest', async function(request, reply) {

        // Ignore 404 routes
        if (request.is404) return;

        // Grab user data
        const connectorReq = await adapter.buildConnectorRequest(request);
        const userDataResponse = await kcc.getUserData(connectorReq);

        //todo: add cookies to the response

        // Store the user data
        request.keycloak = userDataResponse.userData;

        // Grab the protector response
        const connectorResponse = await kcc.buildRouteProtectionResponse(connectorReq, request.keycloak);

        // Handle the response
        if (connectorResponse) {
            await adapter.handleResponse(connectorResponse, reply);
        }
    });

}

export const keycloakConnectorFastify = fastifyPlugin(keycloakConnectorFastifyPlugin, {
    fastify: '4.x',
    name: 'keycloak-connector-server',
    decorators: {
        request: ['cookies'],
    },
    dependencies: ['@fastify/cookie'],
});