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
import type {ClusterMessage, RequestActiveKey, ServerActiveKey} from "keycloak-connector-server";
import {is} from "typia";
import type {
    CancelPendingJwksUpdateMsg,
    NewJwksAvailableMsg,
    PendingJwksUpdateMsg,
    RequestUpdateSystemJwksMsg
} from "keycloak-connector-server";
import {AbstractKeyProvider} from "keycloak-connector-server";

EventEmitter.setMaxListeners(1000);
EventEmitter.defaultMaxListeners = 1000;

const numberOfServers = 40;

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

    const promptChannel = `respond-to-prompt`;

    // Subscribe to our prompt channel
    await mainRedisClusterProvider.subscribe(promptChannel, (message, senderId) => {
        console.log(`${senderId} sent :: `, message);
    });

    do {
        response = (await rl.question("What message would you like to send? ('x' to exit)\n")).toLowerCase();

        switch (response) {
            case "x":
                console.log('******************** Exiting per user request ********************');
                process.exit(0);
                //@ts-ignore
                break;
            case "u":
                console.log('******************** Sending fake update request ********************');
                await mainRedisClusterProvider.publish<RequestUpdateSystemJwksMsg>('key-provider:listening-channel', {
                    event: "request-update-system-jwks",
                    listeningChannel: promptChannel,
                    requestTime: Date.now()/1000,
                    jobName: "The programmer never waits",
                });
                break;
            case "p":
                console.log('******************** Sending fake pending jwks message ********************');
                await mainRedisClusterProvider.publish<PendingJwksUpdateMsg>('key-provider:listening-channel', {
                    event: "pending-jwks-update",
                    processId: "fake-process-id",
                    endOfLockTime: Date.now()/1000 + 60,
                });
                break;
            case "c":
                console.log('******************** Sending fake cancel pending jwks message ********************');
                await mainRedisClusterProvider.publish<CancelPendingJwksUpdateMsg>('key-provider:listening-channel', {
                    event: "cancel-pending-jwks-update",
                    processId: "fake-process-id",
                });
                break;
            case "n":
                console.log('******************** Sending fake new jwks available msg ********************');
                await mainRedisClusterProvider.publish<NewJwksAvailableMsg>('key-provider:listening-channel', {
                    event: "new-jwks-available",
                    processId: "fake-process-id",
                    clusterConnectorKeys: {
                        connectorKeys: await AbstractKeyProvider['createKeys'](),
                        currentStart: Date.now()/1000,
                        prevConnectorKeys: await AbstractKeyProvider['createKeys'](),
                        prevExpire: Date.now()/1000,
                    }
                });
                break;
        }

        // Make linter happy
    } while(response !== "x");
})();

// Periodic sync check
async function syncCheck() {
    const results: Record<string, number> = {};
    const listeningChannel = `key-sync-check-${Date.now()/1000}`;

    function handleSyncCheckResponse(message: ClusterMessage<ServerActiveKey>) {
        // We will assume this is the correct message
        const activeKey = message as ServerActiveKey;

        // Store the results
        results[activeKey.publicKeyMd5] ??= 0;
        results[activeKey.publicKeyMd5]++;
    }

    // Subscribe to the new channel
    await mainRedisClusterProvider.subscribe<ServerActiveKey>(listeningChannel, handleSyncCheckResponse);

    // Push out our request message
    await mainRedisClusterProvider.publish<RequestActiveKey>('key-provider:listening-channel', {
        event: "request-active-key",
        listeningChannel: listeningChannel
    });

    // Only listen for a second and repeat the process
    setTimeout(async () => {
        // Unsubscribe
        await mainRedisClusterProvider.unsubscribe(listeningChannel, handleSyncCheckResponse);

        // Check for sync
        let totalAccountedFor = 0;
        const syncCheckMessages = [];
        for (const [md5, count] of Object.entries(results)) {
            totalAccountedFor += count;
            syncCheckMessages.push(`SYNC-CHECK :: ${count}\t servers with ${md5}`);
        }

        // Check for more than one md5 logged
        if (syncCheckMessages.length > 1) {
            syncCheckMessages.forEach(msg => console.log(msg));
            console.error(`SYNC-CHECK :: FAILED with ${syncCheckMessages.length} different hashes!! ***********************************************`)
        }

        // Check for responding servers
        if (totalAccountedFor !== numberOfServers) {
            console.log(`SYNC-CHECK :: ${numberOfServers - totalAccountedFor} did not respond!! All others are synced!!`);
        }

        // Check for everything good
        if (syncCheckMessages.length === 1 && totalAccountedFor === numberOfServers) {
            console.log(`SYNC-CHECK :: All servers check good!`);
        }

        // Call the next round
        await syncCheck();
    }, 1000);
}

// Start the sync check
// syncCheck();

// Start all servers
try {
    console.log(`Let it rip`);
    await Promise.all([...fastifyServerPromises, promptPromise]);
    console.log('fin');
} catch (e) {
    console.log('error fin');
}