import readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";
import process from "process";
import {redisClusterProvider} from "@dapperduckling/keycloak-connector-cluster-redis";
import type {
    CancelPendingJwksUpdateMsg, ClusterMessage,
    NewJwksAvailableMsg,
    PendingJwksUpdateMsg, RequestActiveKey,
    RequestUpdateSystemJwksMsg, ServerActiveKey
} from "@dapperduckling/keycloak-connector-server";
import {AbstractKeyProvider} from "@dapperduckling/keycloak-connector-server";

export const numberOfServers = {
    express: 5,
    fastify: 5,
} as const;

// Remove existing keys
const prefix = process.env["CLUSTER_REDIS_PREFIX"];
if (prefix === undefined) throw new Error('No prefix in env variables');

const mainRedisClusterProvider = await redisClusterProvider({
    prefix: prefix
});
await mainRedisClusterProvider.connectOrThrow();
console.log("Deleting old keys");
const deleteResult = await mainRedisClusterProvider.remove('key-provider:connector-keys');

// Build the prompt loop promise
export const promptPromise = (async () => {
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
                    jobName: "great-job-name",
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

    function handleSyncCheckResponse(message: ClusterMessage) {
        // We will assume this is the correct message
        const activeKey = message as ServerActiveKey;

        // Store the results
        results[activeKey.publicKeyMd5] ??= 0;
        results[activeKey.publicKeyMd5]++;
    }

    // Subscribe to the new channel
    await mainRedisClusterProvider.subscribe(listeningChannel, handleSyncCheckResponse);

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
        if (totalAccountedFor === 0) {
            console.log(`SYNC-CHECK :: No servers responded!!`);
        } else if (totalAccountedFor !== totalNumberOfServers) {
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
// setImmediate(syncCheck);
