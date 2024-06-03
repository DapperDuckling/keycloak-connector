import './dot-env.js'; // Must be the first import
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {routes} from "./routes.js";
import {keycloakConnectorFastify} from "@dapperduckling/keycloak-connector-server";
import * as fs from "node:fs";
import * as path from "node:path";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

    // Adds option to enable fastify https for testing
    https: {
        key: fs.readFileSync(path.join(__dirname, '../localhost.key.local')),
        cert: fs.readFileSync(path.join(__dirname, '../localhost.cert.local')),
    }
});

// Setup the custom error handler
fastify.setErrorHandler(async (error, request, reply) => {
    // Log error
    fastify.log.error(error);

    // // Send the 500 error
    // return reply.status(500).sendFile('5XX.html');
});

// To store the session state cookie
await fastify.register(cookie, {
    prefix: "keycloak-connector_",
});


// Initialize the keycloak-connector
await fastify.register(keycloakConnectorFastify(), {
    serverOrigin: 'https://dev-local.dapperduckling.com:3005',
    authServerUrl: 'http://localhost:8080/',
    realm: 'local-dev',
    refreshConfigMins: -1, // Disable for dev testing
    wildcardCookieBaseDomain: `dev-local.dapperduckling.com`
    // clusterProvider: clusterProvider,
    // keyProvider: clusterKeyProvider,
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
