import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {fastifyStatic} from "@fastify/static";
import * as path from "path";

import {keycloakConnectorFastify} from "keycloak-connector-server";
import {routes} from "./routes.js";
import {AwsRedisClusterProvider} from "keycloak-connector-server-cluster-aws-redis/src/aws-redis-cluster-provider.js";
import type {Logger} from "pino";

const dotenv = await import('dotenv');
dotenv.config({path: './.env.test'});
dotenv.config({path: './.env.test.local'});
// dotenv.config({path: './tests/integration/fastify/.env.test'});
// dotenv.config({path: './tests/integration/fastify/.env.test.local'});

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
    pluginTimeout: 30000,

    // // Adds option to enable fastify https for testing
    // https: {
    //     key: fs.readFileSync(path.join(__dirname, '../localhost.key.local')),
    //     cert: fs.readFileSync(path.join(__dirname, '../localhost.cert.local')),
    // }
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
fastify.register(cookie, {
    prefix: "keycloak-connector_",
});

fastify.register(fastifyStatic, {
    root: path.join(path.resolve(), 'public'),
    prefix: '/public/', // optional: default '/'
});

// Create our cluster provider
const awsRedisClusterProvider = new AwsRedisClusterProvider({
    prefix: "my-cool-app:*",
    pinoLogger: fastify.log as Logger,
});

// Initialize the keycloak-connector
await fastify.register(keycloakConnectorFastify, {
    serverOrigin: 'http://localhost:3005',
    authServerUrl: 'http://localhost:8080/',
    realm: 'local-dev',
    refreshConfigSecs: -1, // Disable for dev testing
    clusterProvider: awsRedisClusterProvider,
});

// Set and receive a cluster message
await awsRedisClusterProvider.store("my-token", "the one to rule them all", null);
const myToken = await awsRedisClusterProvider.get("my-token");
await awsRedisClusterProvider.remove("my-token");
const myToken2 = await awsRedisClusterProvider.get("my-token");

const listener = (msg: any) => {
    console.log("got a message from my-topic");
    console.log(msg);
};
await awsRedisClusterProvider.subscribe("my-topic", listener);
await awsRedisClusterProvider.publish("my-topic", "really cool message");
await awsRedisClusterProvider.unsubscribe('my-topic', listener);

// Register our routes
fastify.register(routes);

try {
    await fastify.listen({ port: 3005, host: '0.0.0.0'});
} catch (err) {
    fastify.log.error("Fastify server crashed", err);
    console.log(err);
    process.exit(1);
}