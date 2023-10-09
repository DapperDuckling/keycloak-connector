import Fastify from 'fastify';
import type {FastifyInstance} from 'fastify';
import cookie from '@fastify/cookie';
import {fastifyStatic} from "@fastify/static";
import * as path from "path";
import {keycloakConnectorFastify} from "keycloak-connector-server";
import {fastifyRoutes} from "./fastify-routes.js";
import type {Logger} from "pino";
import {clusterKeyProvider} from "keycloak-connector-server";
import {RedisClusterProvider} from "keycloak-connector-cluster-redis";
import {loggerOpts} from "./main.test.js";

export async function makeFastifyServer(port: number) {
    const loggerOptsCloned = structuredClone(loggerOpts);
    loggerOptsCloned['msgPrefix'] = `fastify-${port} :: `;
    const fastifyOptions = {
        logger: loggerOptsCloned,
        pluginTimeout: 0,
    }
    const fastify = Fastify(fastifyOptions);

    // To store the session state cookie
    await fastify.register(cookie, {
        prefix: "keycloak-connector_",
    });

    await fastify.register(fastifyStatic, {
        root: path.join(path.resolve(), 'public'),
        prefix: '/public/', // optional: default '/'
    });

    const clusterProvider = new RedisClusterProvider({
        pinoLogger: fastify.log as Logger,
    });

    // Initialize the keycloak-connector
    await fastify.register(keycloakConnectorFastify, {
        serverOrigin: `http://localhost:${port}`,
        authServerUrl: 'http://localhost:8080/',
        realm: 'local-dev',
        refreshConfigMins: -1, // Disable for dev testing
        clusterProvider: clusterProvider,
        keyProvider: clusterKeyProvider,
        fetchUserInfo: true,
    });

    // Register our routes
    await fastify.register(fastifyRoutes);

    //todo: spitballing
    // groupAuthPlugin: AbstractAuthPlugin = new GroupAuthPlugin()
    // fastify.kcc.registerAuthPlugin(groupAuthPlugin)

    return fastify;
}

export async function startFastifyServer(port: number, fastifyServer: FastifyInstance) {
    try {
        await Promise.all([
            await fastifyServer.listen({
                port: port,
                host: '0.0.0.0',
            }), (async () => console.log(`fastify-${port} :: Listening`))()
        ]);
    } catch (err) {
        fastifyServer.log.error(`${port}:: Fasify server crashed **********************`, err);
        console.log(err);
    }
}
