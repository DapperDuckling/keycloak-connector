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
import {makeFastifyServer, startFastifyServer} from "./fastify-server.js";
import {makeExpressServer, startExpressServer} from "./express-server.js";

EventEmitter.setMaxListeners(1000);
EventEmitter.defaultMaxListeners = 1000;

const numberOfServers = {
    express: 20,
    fastify: 0,
} as const;

export const loggerOpts = {
    msgPrefix: "base",
    level: "debug",
    transport: {
        target: 'pino-pretty',
        options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
        },
    },
};

// Remove existing keys
const prefix = process.env["CLUSTER_REDIS_PREFIX"];
if (prefix === undefined) throw new Error('No prefix in env variables');
const mainRedisClusterProvider = new RedisClusterProvider({
    prefix: prefix
});
await mainRedisClusterProvider.connectOrThrow();
console.log("Deleting old keys");
const deleteResult = await mainRedisClusterProvider.remove('key-provider:connector-keys');


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
const totalNumberOfServers = Object.values(numberOfServers).reduce((sum: number, value: number) => sum + value, 0);
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
        if (totalAccountedFor !== totalNumberOfServers) {
            console.log(`SYNC-CHECK :: ${totalNumberOfServers - totalAccountedFor} did not respond!! All others are synced!!`);
        }

        // Check for everything good
        if (syncCheckMessages.length === 1 && totalAccountedFor === totalNumberOfServers) {
            console.log(`SYNC-CHECK :: All servers check good!`);
        }

        // Call the next round
        await syncCheck();
    }, 1000);
}

// Start the sync check
// syncCheck();

function buildServer(port: number, serverType: string) {
    let makeServerPromise;
    let startServerPromise;

    let makeServerFunc;
    let startServerFunc;

    switch (serverType) {
        case 'fastify':
            makeServerFunc = makeFastifyServer;
            startServerFunc = startFastifyServer;
            break;
        case 'express':
            makeServerFunc = makeExpressServer;
            startServerFunc = startExpressServer;
            break;
        default:
            throw new Error('Unknown server type');
    }

    makeServerPromise = (async () => {
        // Create the fastify server
        const server = await makeServerFunc(port);

        console.log(`${port} :: Created`);

        startServerPromise = startServerFunc(port, server as any);
    })();

    return {
        makeServerPromise,
        startServerPromise,
    };
}

// Make all our fastify servers
const makeServerPromises: any[] = [];
const startServerPromises: any[] = [];
let portNumber = 3000;
for (let i= 0; i<numberOfServers.fastify; i++) {
    const {makeServerPromise, startServerPromise} = buildServer(portNumber++, 'fastify');
    makeServerPromises.push(makeServerPromise);
    startServerPromises.push(startServerPromise);
}

for (let i=0; i<numberOfServers.express; i++) {
    const {makeServerPromise, startServerPromise} = buildServer(portNumber++, 'express');
    makeServerPromises.push(makeServerPromise);
    startServerPromises.push(startServerPromise);
}


// Wait for the servers to get created
await Promise.all(makeServerPromises);

// Start all servers
try {
    console.log(`Let it rip`);
    await Promise.all([...startServerPromises, promptPromise]);
    console.log('fin');
} catch (e) {
    console.log('error fin');
}