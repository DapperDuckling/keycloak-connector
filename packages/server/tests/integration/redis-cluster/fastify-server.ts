import Fastify from 'fastify';
import type {FastifyInstance} from 'fastify';
import cookie from '@fastify/cookie';
import {fastifyStatic} from "@fastify/static";
import * as path from "path";
import {keycloakConnectorFastify} from "keycloak-connector-server";
import {routes} from "./routes.js";
import type {Logger} from "pino";
import {clusterKeyProvider} from "keycloak-connector-server";
import {RedisClusterProvider} from "keycloak-connector-server-cluster-redis";
import {loggerOpts} from "./main.test.js";

const dotenv = await import('dotenv');
dotenv.config({path: './.env.test'});
dotenv.config({path: './.env.test.local'});

const baseFastifyOpts = Object.freeze({
    logger: {
        msgPrefix: "base",
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

export async function makeFastifyServer(serverId: number) {
    const loggerOptsCloned = structuredClone(loggerOpts);
    loggerOptsCloned['msgPrefix'] = `fastify-${serverId} :: `;
    const fastifyOptions = {
        logger: loggerOptsCloned,
        pluginTimeout: 120000,
    }
    const fastify = Fastify(fastifyOptions);

    // To store the session state cookie
    fastify.register(cookie, {
        prefix: "keycloak-connector_",
    });

    fastify.register(fastifyStatic, {
        root: path.join(path.resolve(), 'public'),
        prefix: '/public/', // optional: default '/'
    });

    const clusterProvider = new RedisClusterProvider({
        pinoLogger: fastify.log as Logger,
    });

    // Initialize the keycloak-connector
    await fastify.register(keycloakConnectorFastify, {
        serverOrigin: 'http://localhost:3005',
        authServerUrl: 'http://localhost:8080/',
        realm: 'local-dev',
        refreshConfigMins: -1, // Disable for dev testing
        clusterProvider: clusterProvider,
        keyProvider: clusterKeyProvider,
    });

    // Register our routes
    fastify.register(routes);

    return fastify;
}

export async function startFastifyServer(port: number, fastifyServer: FastifyInstance) {
    try {
        await Promise.all([
            await fastifyServer.listen({
                port: port,
                host: '0.0.0.0',
            }), (async () => console.log(`${port} :: Listening`))()
        ]);
    } catch (err) {
        fastifyServer.log.error(`${port}:: Fasify server crashed **********************`, err);
        console.log(err);
    }
}
