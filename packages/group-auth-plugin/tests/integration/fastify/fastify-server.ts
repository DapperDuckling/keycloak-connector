import './dot-env.js'; // Must be the first import
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {fastifyStatic} from "@fastify/static";
import * as path from "path";
import {keycloakConnectorFastify} from "keycloak-connector-server";
import {routes} from "./routes.js";
import {groupAuthFastify} from "keycloak-connector-group-auth-plugin";

// Configure fastify
const fastify = Fastify({
    logger: {
        level: "debug",
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    },
    pluginTimeout: 120000,
});

// Setup the custom error handler
fastify.setErrorHandler(async (error, request, reply) => {
    // Log error
    fastify.log.error(error);

    // Send the 500 error
    return reply.status(500).sendFile('5XX.html');
});

// Setup the file not found handler
fastify.setNotFoundHandler(async (request, reply) => {
    // Send the 404 not found
    return reply.status(404).sendFile('404.html');
});

// To store the session state cookie
await fastify.register(cookie, {
    prefix: "keycloak-connector_",
});

await fastify.register(fastifyStatic, {
    root: path.join(path.resolve(), 'public'),
    prefix: '/public/', // optional: default '/'
});

// Initialize the keycloak-connector
await fastify.register(keycloakConnectorFastify, {
    serverOrigin: 'http://localhost:3005',
    authServerUrl: 'http://localhost:8080/',
    realm: 'local-dev',
    refreshConfigMins: -1, // Disable for dev testing
    fetchUserInfo: true,
});

// Register the group auth plugin
await fastify.register(groupAuthFastify, {
    app: 'group-auth-test-app',
    appInheritanceTree: {
        "forum_admin": ["supervisor"],
        "admin": "*",
        "supervisor": ["forum_admin", "site_test"],
        "site_test": ["forum_admin", "random"],
        "random": ["something_else"],
    }
});

// Register our routes
await fastify.register(routes);

try {
    await fastify.listen({ port: 3005, host: '0.0.0.0'});
} catch (err) {
    fastify.log.error("Fastify server crashed", err);
    console.log(err);
    process.exit(1);
}
