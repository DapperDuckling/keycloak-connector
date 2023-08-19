import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {fastifyStatic} from "@fastify/static";
import * as path from "path";

import {keycloakConnectorFastify} from "keycloak-connector-server";
import {routes} from "./routes.js";
import type {Logger} from "pino";
import {clusterKeyProvider} from "keycloak-connector-server";
import {RedisClusterProvider} from "keycloak-connector-server-cluster-redis";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from 'node:process';
import * as process from "process";

import { EventEmitter } from 'node:events';

EventEmitter.setMaxListeners(1000);
EventEmitter.defaultMaxListeners = 1000;

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

async function makeFastifyServer(serverId: number) {
    const fastifyOptions = structuredClone(baseFastifyOpts);
    fastifyOptions.logger['msgPrefix'] = `fastify-${serverId} :: `;
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

    // Remove the existing cluster keys
    if (serverId === 0) {
        console.log(`REMOVING OLD KEYS!`);
        await clusterProvider.remove('key-provider:connector-keys');
    }

    // Register our routes
    fastify.register(routes);

    return fastify;
}

// Remove existing keys
const prefix = process.env["CLUSTER_REDIS_PREFIX"];
if (prefix === undefined) throw new Error('No prefix in env variables');
const mainRedisClusterProvider = new RedisClusterProvider({
    prefix: prefix
});
await mainRedisClusterProvider.connectOrThrow();
console.log("Deleting old keys");
const deleteResult = await mainRedisClusterProvider.remove('key-provider:connector-keys');

// Make all our fastify servers
const makeFastifyServerPromises: any[] = [];
const fastifyServerPromises: any[] = [];
for (let i= 0; i<40; i++) {
    console.log(`${i} :: Making build promise`);

    // Build our make fastify server promises
    makeFastifyServerPromises.push(
        (async () => {
            // Create the fastify server
            const fastifyServer = await makeFastifyServer(i);

            console.log(`${i} :: Created`);

            fastifyServerPromises.push(
                (async () => {
                    try {
                        await Promise.all([
                            await fastifyServer.listen({
                                port: 3000 + i,
                                host: '0.0.0.0',
                            }), (async () => console.log(`${i} :: Listening`))()
                        ]);
                    } catch (err) {
                        fastifyServer.log.error(`${i}:: Server crashed **********************`, err);
                        console.log(err);
                    }
                })()
            );
        })()
    );
}

// Wait for the servers to get created
await Promise.all(makeFastifyServerPromises);

// Build the prompt loop promise
const promptPromise = (async () => {
    const rl = readline.createInterface({input, output});
    let response: string;
    console.log(`About to show prompt`);
    do {
        response = (await rl.question("What message would you like to send? ('x' to exit)\n")).toLowerCase();

        if (response === "x") {
            console.log('Exiting per user request');
            process.exit(0);
        }

        // Make linter happy
    } while(response !== "x");
})();

// Start all servers
try {
    console.log(`Let it rip`);
    await Promise.all([...fastifyServerPromises, promptPromise]);
    console.log('fin');
} catch (e) {
    console.log('error fin');
}