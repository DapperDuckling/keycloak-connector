import Fastify from 'fastify';
import {keycloakConnectorFastify} from "@dapperduckling/keycloak-connector-server";
import cookie from '@fastify/cookie';
import {pinoLoggerOptions, responses} from "../common.mjs";

const serverPort = 3005;

// Configure fastify
const fastify = Fastify({
    logger: pinoLoggerOptions,
    pluginTimeout: 120_000,     // Allow for lengthy plugin initialization
});

// Add cookie support to fastify
await fastify.register(cookie);

// Initialize the keycloak connector
await fastify.register(keycloakConnectorFastify(), {
    realm: 'kcc-example',
    clientId: 'example-fastify-app',
    clientSecret: 'EXAMPLE_SECRET_ONLY_IN_DEV',      // A password is not allowed in non-dev environments
    DANGEROUS_disableJwtClientAuthentication: true, // Only allowed in dev environments
    fetchUserInfo: true,
    serverOrigin: `http://localhost:${serverPort}`, // This server's origin
    authServerUrl: 'http://localhost:8080',        // Your keycloak server here

    /** Uncomment the following options to enable dev on a client served on a different port */
    // validOrigins: [
    //     `http://localhost:3005`,
    // ],
    // redirectUri: `http://localhost:3005`,

    /**
     * Uncomment and configure the following option for production when your backend and frontend are hosted
     *  on the same port, but backend routes have a different url prefix
     */
    // routePaths: {
    //     '_prefix': '/api/auth'
    // }
});

//
// Register routes
//

// A public route
fastify.get('/', {config: {public: true}}, async (request, reply) => {
    reply.type('text/html')
    return responses.public;
});

// Only authentication required route
fastify.get('/no-role-required', async (request, reply) => {
    reply.type('text/html')
    return responses.noRole;
});

// Requires "COOL_GUY" role
fastify.get('/cool-guy', {config: {roles: ['COOL_GUY']}}, async (request, reply) => {
    reply.type('text/html')
    return responses.coolGuy;
});

// Launch the server
await fastify.listen({ port: serverPort, listenTextResolver: () => `Server listening at http://localhost:${serverPort}`});
