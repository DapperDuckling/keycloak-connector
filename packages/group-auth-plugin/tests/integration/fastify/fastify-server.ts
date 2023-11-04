import './dot-env.js'; // Must be the first import
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {fastifyStatic} from "@fastify/static";
import * as path from "path";
import {keycloakConnectorFastify} from "keycloak-connector-server";
import {routes} from "./routes.js";
import {groupAuthFastify} from "keycloak-connector-group-auth-plugin";
import {generateGraph, depth, depth2} from "keycloak-connector-group-auth-plugin";

// Perform test of different algo
for (let i=0; i<100; i++) {
    console.log(`Starting ${i}`);
    const graph = generateGraph(200);
    console.log(`\t${i} - graph generated`);
    const result1 = depth(graph);
    console.log(`\t${i} - depth1`);
    const result2 = await depth2(graph);
    console.log(`\t${i} - depth2`);
    const isMatch = compareResults(result1, result2);
    if (!isMatch) throw new Error(`NOt a match!!`);
    console.log(`\t${i} ** matched!`);
}

// Compare results
function compareResults(result1: Record<string, Set<string>>, result2: Record<string, Set<string>>) {
    // Check for different lengths
    if (Object.keys(result1).length !== Object.keys(result2).length) {
        console.log('bad length');
        return false;
    }

    // Loop through keys
    for (const [key, matches1] of Object.entries(result1)) {
        // Grab the matching set
        const matches2 = result2[key];

        if (matches2 === undefined) {
            console.log(`missing match for ${key}`);
            return false;
        }

        const allMatched1 = [...matches1.values()].every(match1 => matches2.has(match1));
        const allMatched2 = [...matches2.values()].every(match2 => matches1.has(match2));

        if (!allMatched1 || !allMatched2) {
            console.log(`bad match for ${key}`);
            return false;
        }
    }

    return true;
}


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
    inheritanceTree: {
        "forum_admin": ["supervisor"],
        "admin": ["supervisor"],
        "supervisor": ["forum_admin", "site_test"],
        "site_test": ["forum_admin"],
        "random": ["admin"],
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
