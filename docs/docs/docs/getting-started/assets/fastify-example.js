import Fastify from 'fastify';
import {keycloakConnectorFastify} from "@dapperduckling/keycloak-connector-server";
import cookie from '@fastify/cookie';

const serverPort = 5000;

// Configure fastify
const fastify = Fastify({
    pluginTimeout: 120_000,     // Allow for lengthy plugin initialization
});

// Add cookie support to fastify
await fastify.register(cookie);

// Initialize the keycloak connector
await fastify.register(keycloakConnectorFastify(), {
    realm: 'kcc-example',
    clientId: 'example-fastify-app',
    clientSecret: '***REPLACE WITH CLIENT SECRET FROM KEYCLOAK***', // Dev only
    DANGEROUS_disableJwtClientAuthentication: true, // Dev only
    fetchUserInfo: true,
    serverOrigin: `http://localhost:${serverPort}`, // This server's origin
    authServerUrl: 'http://localhost:8080',        // Your keycloak server here
});

// A public route
fastify.get('/', {config: {public: true}}, async () => {
    return `Public route`;
});

// Only authentication required for this route
fastify.get('/private', async () => {
    return `Private route`;
});

// Launch the server
await fastify.listen({
    port: serverPort,
    listenTextResolver: () => `Server listening at http://localhost:${serverPort}`
});
