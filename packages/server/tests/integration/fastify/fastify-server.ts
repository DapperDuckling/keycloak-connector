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
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    }

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
    redisConfig: {
        url: "clustercfg.keycloak-connector-aws-redis-channel.6ufjp6.usgw1.cache.amazonaws.com:6379",


        region: process.env["AWS_REDIS_USERNAME"] ?? "",
        logger: fastify.log,
        endpoint: "clustercfg.keycloak-connector-aws-redis-channel.6ufjp6.usgw1.cache.amazonaws.com:6379",

    },
    // credentials: {
    //     username: process.env["AWS_REDIS_USERNAME"] ?? "",
    //     password: process.env["AWS_REDIS_PASSWORD"] ?? ""
    // },
    // endpoint: "clustercfg.keycloak-connector-aws-redis-channel.6ufjp6.usgw1.cache.amazonaws.com:6379",
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

// Register our routes
fastify.register(routes);

try {
    await fastify.listen({ port: 3005, host: '0.0.0.0'});
} catch (err) {
    fastify.log.error("Fastify server crashed", err);
    console.log(err);
    process.exit(1);
}