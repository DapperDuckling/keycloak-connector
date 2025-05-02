import type {KeyProviderConfig} from "./abstract-key-provider.js";
import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {AbstractClusterProvider, ClusterMessage, LockOptions} from "../cluster/abstract-cluster-provider.js";
import {BaseClusterEvents} from "../cluster/abstract-cluster-provider.js";
import type {ConnectorKeys, ConnectorKeysSerializable, KeyProvider} from "../types.js";
import {throttle, sleep} from "../helpers/utils.js";
import {is, validate} from "typia";
import {ClusterJob} from "../cluster/cluster-job.js";
import type {JWK} from "jose";
import type {
    CancelPendingJwksUpdateMsg,
    ClusterKeyProviderMsgs,
    NewJwksAvailableMsg,
    PendingJwksUpdateMsg,
    ServerActiveKey
} from "./cluster-key-provider-message-types.js";
import {webcrypto} from "crypto";
import {LRUCache} from "lru-cache";
import {createHash} from "node:crypto";
import {setImmediate} from "timers";
import {isObject} from "@dapperduckling/keycloak-connector-common";

export type ClusterConnectorKeys<T extends "full" | "serializable" = "full"> = {
    connectorKeys: T extends "serializable" ? ConnectorKeysSerializable : ConnectorKeys;
    currentStart?: number;
    prevConnectorKeys?: T extends "serializable" ? ConnectorKeysSerializable : ConnectorKeys;
    prevExpire?: number;
};

interface GenerateClusterKeysConfig {
    onlyIfStoreIsEmpty?: boolean,
    clusterJob?: ClusterJob,
}

interface PendingNewJwks {
    senderId: string,
    lockExpiration: number,
    timeout: ReturnType<typeof setTimeout>,
}

export class ClusterKeyProvider extends AbstractKeyProvider {

    private readonly constants = {
        MAX_INITIALIZE_ATTEMPTS: 10,
        CURR_JWKS_START_DELAY_SECS: 2 * 60,         // 2 minutes
        MAX_CURR_JWKS_START_DELAY_SECS: 10 * 60,    // 10 minutes
        PREV_JWKS_EXPIRATION_SECS: 10 * 60,         // 10 minutes
        MAX_PREV_JWKS_EXPIRATION_SECS: 3600,        // 1 hour
        _PREFIX: "key-provider",
        CONNECTOR_KEYS: "connector-keys",
        LISTENING_CHANNEL: "listening-channel",
        UPDATE_JWKS: "update-jwks",
    } as const;

    private readonly clusterProvider: AbstractClusterProvider;
    private clusterConnectorKeys: ClusterConnectorKeys | null = null;
    private pendingNewJwksLru;

    private constructor(keyProviderConfig: KeyProviderConfig) {
        super(keyProviderConfig);

        // Check for a cluster provider
        if (keyProviderConfig.clusterProvider === undefined) {
            throw new Error(`Cannot initialize ${this.constructor.name} without a cluster provider.`);
        }

        // Store reference to the cluster provider
        this.clusterProvider = keyProviderConfig.clusterProvider;

        // Create the pending Jwks store
        this.pendingNewJwksLru = new LRUCache<string, PendingNewJwks>({
            max: 100,
            dispose: this.pendingNewJwksDispose,
        });

        // Listen for reconnections
        this.clusterProvider.addListener(BaseClusterEvents.SUBSCRIBER_RECONNECTED, () => this.onActiveKeyUpdate);
    }

    private listeningChannel = () => `${this.constants._PREFIX}:${this.constants.LISTENING_CHANNEL}`;

    public async getPublicKeys(): Promise<JWK[]> {
        const publicKeys: JWK[] = [];

        // Add the current key
        if (this.clusterConnectorKeys) publicKeys.push(this.clusterConnectorKeys.connectorKeys.publicJwk);

        // Add the previous key
        const previousKeys = this.clusterConnectorKeys?.prevConnectorKeys;
        const previousKeysExpiration = this.clusterConnectorKeys?.prevExpire;
        if (previousKeys && previousKeysExpiration &&
            previousKeysExpiration + 1 > Date.now() / 1000 &&
            previousKeysExpiration < Date.now() / 1000 + this.constants.MAX_PREV_JWKS_EXPIRATION_SECS) publicKeys.push(previousKeys);

        return publicKeys;
    }

    public override async getActiveKeys(): Promise<ConnectorKeys> {
        // Get existing keys or generate & save then return new keys
        return (this.clusterConnectorKeys) ? this.getActiveConnectorKeys(this.clusterConnectorKeys) : await this.generateKeys();
    }

    private getActiveConnectorKeys(clusterConnectorKeys: ClusterConnectorKeys): ConnectorKeys {
        // Check if current start time is in the future and we have previous keys
        if ((clusterConnectorKeys.currentStart ?? 0) > Date.now()/1000 &&
            clusterConnectorKeys.prevConnectorKeys) return clusterConnectorKeys.prevConnectorKeys;

        // Just return the current keys
        return clusterConnectorKeys.connectorKeys;
    }

    protected async generateKeys(): Promise<ConnectorKeys> {

        // Keep track of the number of attempts
        let attempt = 1;

        do {
            // Grab keys from the cluster
            this.clusterConnectorKeys = await this.getKeysFromCluster();

            // Return the keys from the cluster
            if (this.clusterConnectorKeys) return this.getActiveConnectorKeys(this.clusterConnectorKeys);

            // Generate cluster keys
            this.clusterConnectorKeys = await this.generateClusterKeys();

            // Return the keys from cluster generation
            if (this.clusterConnectorKeys) return this.getActiveConnectorKeys(this.clusterConnectorKeys);

        } while(
            attempt < this.constants.MAX_INITIALIZE_ATTEMPTS &&
            // Add wait period before next attempt
            await sleep(attempt++ *  500)
        );

        throw new Error(`Failed to generate keys after ${this.constants.MAX_INITIALIZE_ATTEMPTS} attempts`);
    }

    private async getAndStoreKeysFromCluster(): Promise<void> {
        this.clusterConnectorKeys = await this.getKeysFromCluster();
    }

    public override triggerKeySync(): void {
        // Grab keys from the cluster
        this.keyProviderConfig.pinoLogger?.info("Attempting to sync keys with cluster");
        throttle(this.getAndStoreKeysFromCluster.bind(this), 1000);
    }

    private async generateClusterKeys(config: GenerateClusterKeysConfig = {}): Promise<ClusterConnectorKeys | null> {

        // Generate a process id
        const processId = webcrypto.randomUUID();

        // Create a sub-logger with the new process id
        const logger = this.keyProviderConfig.pinoLogger?.child({"Source": `KeyProvider:Process:${processId}`});

        // Store the id on the associate job
        if (config.clusterJob) config.clusterJob.processId = processId;

        // Setup lock options
        const lockOptions: LockOptions = {
            key: `${this.constants._PREFIX}:${this.constants.UPDATE_JWKS}`,
            ttl: 60,
        };

        // Calculate end of lock time
        const endOfLockTime = Date.now()/1000 + lockOptions.ttl;

        // Attempt to obtain a lock
        const lock = await this.clusterProvider.lock(lockOptions);

        // Check for no lock
        if (!lock) {
            logger?.debug(`Could not obtain lock, cannot generate cluster keys`);
            await config.clusterJob?.heartbeat(`Could not obtain lock, cannot generate cluster keys`);
            return null;
        }

        try {
            // Send out start job message
            await config.clusterJob?.start();

            // Grab the latest existing keys
            const clusterConnectorKeys = await this.getKeysFromCluster();

            // Check for existing keys and config flag
            if (clusterConnectorKeys && config.onlyIfStoreIsEmpty) {
                logger?.debug(`Keys exists in store, using existing keys`);
                return clusterConnectorKeys;
            }

            // Check if the current key has not yet started
            if (clusterConnectorKeys?.currentStart &&
                clusterConnectorKeys?.currentStart + 1 > Date.now() / 1000 &&
                clusterConnectorKeys?.currentStart < Date.now() / 1000 + this.constants.MAX_CURR_JWKS_START_DELAY_SECS) {

                logger?.warn(`New current key has not yet started, will not create new cluster key`);
                await config.clusterJob?.fatalError(`New current key has not yet started (${clusterConnectorKeys.currentStart}), will not create new cluster key`);
                return null;
            }

            // Check if the previous key has NOT expired AND the expiration timestamp is reasonable
            if (clusterConnectorKeys?.prevExpire &&
                clusterConnectorKeys?.prevExpire + 1 > Date.now() / 1000 &&
                clusterConnectorKeys?.prevExpire < Date.now() / 1000 + this.constants.MAX_PREV_JWKS_EXPIRATION_SECS) {

                logger?.warn(`Previous key has not yet expired, will not create new cluster key`);
                await config.clusterJob?.fatalError(`Previous key has not yet expired (${clusterConnectorKeys.prevExpire}), will not create new cluster key`);
                return null;
            }


            // Actually create the new keys
            const newConnectorKeys = await AbstractKeyProvider.createKeys();

            // Build new cluster connector keys object
            const newClusterConnectorKeys: ClusterConnectorKeys = {
                connectorKeys: newConnectorKeys,
                ...clusterConnectorKeys && {
                    currentStart: Date.now() / 1000 + this.constants.CURR_JWKS_START_DELAY_SECS, // Only add a delay if there are existing keys
                    prevConnectorKeys: clusterConnectorKeys?.connectorKeys,
                    prevExpire: Date.now() / 1000 + this.constants.PREV_JWKS_EXPIRATION_SECS
                }
            }

            // Convert object to string
            const newClusterConnectorKeysJSON = JSON.stringify(newClusterConnectorKeys);

            // Send out status message
            await config.clusterJob?.heartbeat(`Keys created, about to store if lock still exists`);

            // Advise all listeners of the pending update (in case the future publish is missed)
            if (newClusterConnectorKeys.currentStart) {
                await this.clusterProvider.publish<PendingJwksUpdateMsg>(this.listeningChannel(), {
                    event: "pending-jwks-update",
                    endOfLockTime: endOfLockTime,
                    processId: processId,
                });
            }

            // Store the keys with no expiration
            const storeResult = await this.clusterProvider.store(`${this.constants._PREFIX}:${this.constants.CONNECTOR_KEYS}`, newClusterConnectorKeysJSON, null, lockOptions.key);

            if (!storeResult) {
                // Advise all listeners to cancel the pending update request
                if (newClusterConnectorKeys.currentStart) {
                    await this.clusterProvider.publish<CancelPendingJwksUpdateMsg>(this.listeningChannel(), {
                        event: "cancel-pending-jwks-update",
                        processId: processId,
                    });
                }

                // Check if the lock expired
                if (Date.now() / 1000 > endOfLockTime) {
                    logger?.error(`Failed to store updated keys. Unknown issue.`);
                } else {
                    logger?.error(`Failed to store updated keys. Likely due to lock expiration.`);
                }
                return null;
            }

            // Store the new keys
            this.clusterConnectorKeys = newClusterConnectorKeys;

            // Advise all listeners that a new jwk is available and will be ready for use soon
            await this.clusterProvider.publish<NewJwksAvailableMsg>(this.listeningChannel(), {
                event: "new-jwks-available",
                serializedClusterConnectorKeys: await this.serializeClusterConnectorKeys(newClusterConnectorKeys),
                processId: processId,
            });

            // Continuously pass the status message (if using a cluster job)
            setImmediate(async function statusUpdateFunc() {

                // Check if there is no start time for the new key
                if (newClusterConnectorKeys.currentStart === undefined) return;

                // Check if job does not exist
                if (config.clusterJob === undefined) return;

                // Check if job is finished
                if (config.clusterJob.isFinished()) return;

                // Calculate remaining time until start
                const secondsUntilNewKeyStart = Math.max(Math.round(newClusterConnectorKeys.currentStart - Date.now() / 1000), 0);

                // Sanity check seconds
                if (secondsUntilNewKeyStart <= 0) return;

                // Send status message
                await config.clusterJob.heartbeat(`Waiting until new key start to update Keycloak cache. Time remaining: ${secondsUntilNewKeyStart} seconds`);

                // Self licking ice cream cone
                setTimeout(statusUpdateFunc, 10000);
            });

            // Calculate remaining time until start
            const secondsUntilNewKeyStart = (newClusterConnectorKeys.currentStart) ? Math.max(newClusterConnectorKeys.currentStart - Date.now() / 1000, 0) : 0;

            // Configure a timeout to pass final messages and handle callback
            setTimeout(async () => {

                logger?.debug(`New key has started`);

                // Execute the on active key update callback
                if (this.onActiveKeyUpdate) {
                    logger?.debug(`Executing the on active key update callback`);
                    await this.onActiveKeyUpdate();
                }

                // Update the oidc server
                logger?.debug(`Executing the update oidc server callback`);
                await this.updateOidcServer();

                // Send job finish notification
                await config.clusterJob?.finish();
                logger?.debug(`Finished update`);
            }, secondsUntilNewKeyStart * 1000);

            return newClusterConnectorKeys;
        } finally {

            // Release the held lock
            const unlock = await this.clusterProvider.unlock(lockOptions);

            if (!unlock) {
                const lockExpiresIn = Math.round(endOfLockTime - Date.now() / 1000);
                const warnMsg = (lockExpiresIn > 0) ? `Lock will expire in ${lockExpiresIn} seconds` : `Lock already expired ${Math.abs(lockExpiresIn)} seconds ago.`;
                logger?.warn(`Failed to unlock cluster key generation lock. ${warnMsg}`);
            }

        }
    }

    private async getKeysFromCluster(): Promise<ClusterConnectorKeys | null> {
        const keysJSON = await this.clusterProvider.get(`${this.constants._PREFIX}:${this.constants.CONNECTOR_KEYS}`);

        // Check for any found value
        if (keysJSON === null) return null;

        let keys;

        try {
            // Attempt to restore the data
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            keys = JSON.parse(keysJSON);
        } catch (e) {
            this.keyProviderConfig.pinoLogger?.error(`Stored key string is not valid JSON`);
            return null;
        }

        // Check if the returned data is our expected type
        if (!is<ClusterConnectorKeys<'serializable'>>(keys)) {
            this.keyProviderConfig.pinoLogger?.error(`Stored key string is valid JSON, but does not match expected type`);
            return null;
        }

        return this.importClusterFromSerializable(keys);
    }

    protected async importClusterFromSerializable(
        serializedKeys: ClusterConnectorKeys<'serializable'>
    ): Promise<ClusterConnectorKeys> {
        const {
            connectorKeys: rawConnectorKeys,
            prevConnectorKeys: rawPrevConnectorKeys,
            ...rest
        } = serializedKeys;

        const connectorKeys = await this.importFromSerializable(rawConnectorKeys);
        const prevConnectorKeys = rawPrevConnectorKeys
            ? await this.importFromSerializable(rawPrevConnectorKeys)
            : undefined;

        return {
            ...rest,
            connectorKeys,
            ...(prevConnectorKeys && { prevConnectorKeys }),
        };
    }

    protected async serializeClusterConnectorKeys(clusterConnectorKeys: ClusterConnectorKeys): Promise<ClusterConnectorKeys<"serializable">> {
        return {
            ...clusterConnectorKeys,
            connectorKeys: await this.serializeConnectorKeys(clusterConnectorKeys.connectorKeys),
            ...(clusterConnectorKeys.prevConnectorKeys && {
                prevConnectorKeys: await this.serializeConnectorKeys(clusterConnectorKeys.prevConnectorKeys),
            }),
        };
    }

    private async setupSubscriptions() {
        // Grab the listening channel
        const listeningChannel = this.listeningChannel();

        try {
            // Clear existing subscription
            const unsubResults = await this.clusterProvider.unsubscribe(listeningChannel, this.pubSubMessageHandler, true);

            // Check the results of the unsubscription
            if (!unsubResults) this.keyProviderConfig.pinoLogger?.debug(`Failed to unsubscribe from ${listeningChannel}`);

            // Add subscription
            const subResults = await this.clusterProvider.subscribe(listeningChannel, this.pubSubMessageHandler, true);

            // Check the result of the subscription
            if (!subResults) this.keyProviderConfig.pinoLogger?.debug(`Failed to subscribe to ${listeningChannel}`);

            return subResults;

        } catch (e) {
            if (isObject(e)) this.keyProviderConfig.pinoLogger?.error(e);
            this.keyProviderConfig.pinoLogger?.error(`Error while subscribing to ${listeningChannel}`);
            return false;
        }
    }

    private pubSubMessageHandler = async (message: ClusterMessage, senderId: string) => {

        // Ensure we have the correct message back
        if (!is<ClusterKeyProviderMsgs>(message)) {
            this.keyProviderConfig.pinoLogger?.warn(`Unexpected pub/sub message`);
            return;
        }

        // Determine which handler should accept this message
        switch (message.event) {
            case "request-update-system-jwks":
                await this.generateClusterKeys({
                    clusterJob: new ClusterJob({
                        clusterProvider: this.clusterProvider,
                        targetChannel: message.listeningChannel,
                        requestTimestamp: message.requestTime,
                        ...message.jobName && {jobName: message.jobName},
                    })
                });
                break;
            case "pending-jwks-update":

                // Calculate the timeout length
                const timeoutSecs = Math.max(message.endOfLockTime - Date.now()/1000, 0);

                // Build the new timeout
                const timeoutKey = setTimeout(
                    () => this.handleNewJwks(message.processId),
                    timeoutSecs * 1000
                );

                // Record the pending update
                this.pendingNewJwksLru.set(message.processId, {
                    timeout: timeoutKey,
                    senderId: senderId,
                    lockExpiration: message.endOfLockTime,
                });

                break;
            case "cancel-pending-jwks-update":
                // Clear existing entry (it will auto-dispose of the timeout)
                const cancelResult = this.pendingNewJwksLru.delete(message.processId);

                // No match
                if (!cancelResult) {
                    this.keyProviderConfig.pinoLogger?.debug(`No pending new jwks entry matching process ID ${message.processId} from sender ${senderId}. This is okay if this instance just recently started.`);
                    return;
                }

                break;
            case "new-jwks-available":
                // Handle the new jwks
                const clusterConnectorKeys = await this.importClusterFromSerializable(message.serializedClusterConnectorKeys);
                await this.handleNewJwks(message.processId, clusterConnectorKeys);
                break;
            case "request-active-key":
                // Grab the active keys
                const activeKeys = await this.getActiveKeys();

                // String version the public key
                const publicKeyString = JSON.stringify(activeKeys.publicJwk);

                // Reply with the active key
                await this.clusterProvider.publish<ServerActiveKey>(message.listeningChannel, {
                    event: "server-active-key",
                    publicKeyMd5: createHash('md5').update(publicKeyString).digest('hex')
                });

                break;
            default:
                this.keyProviderConfig.pinoLogger?.warn(`Unexpected event received, cannot process message`);
        }
    }

    private pendingNewJwksDispose = (pendingNewJwks: PendingNewJwks, key: string, reason: LRUCache.DisposeReason): void => {
        // Log an eviction
        if (reason === "evict") {
            this.keyProviderConfig.pinoLogger?.error(`Too many pending jwks messages, purging LRU request (${key}) with sender (${pendingNewJwks.senderId}). Is there a rogue message sender flooding the channel?!`);
        }

        // Clear the timeout
        clearTimeout(pendingNewJwks.timeout);
    };

    private async handleNewJwks(processId: string, newClusterConnectorKeys?: ClusterConnectorKeys) {

        // Clear existing entry (it will auto-dispose of the timeout)
        this.pendingNewJwksLru.delete(processId);

        // Grab and store the new keys
        if (newClusterConnectorKeys) {
            // Grab the keys from the params
            this.clusterConnectorKeys = newClusterConnectorKeys;
        } else {
            // Grab keys from the store
            const storeKeys = await this.getKeysFromCluster();

            if (!storeKeys) {
                this.keyProviderConfig.pinoLogger?.debug(`Expected to update keys, but no keys found in store`);
                return;
            }

            this.clusterConnectorKeys = storeKeys;
        }

        // Update the active key when the new key becomes active
        setTimeout(async () => {
            const storeKeys = await this.getKeysFromCluster();

            if (!storeKeys) {
                this.keyProviderConfig.pinoLogger?.error(`New key should be active, but could not find any keys in the cluster`);
                return;
            }

            // Store the keys again (in case they changed rapidly)
            this.clusterConnectorKeys = storeKeys;

            // Run the main active key update callback
            await this.onActiveKeyUpdate?.();
        }, this.clusterConnectorKeys.currentStart ?? 0);

    }

    static async factory(keyProviderConfig: KeyProviderConfig) {
        // Create a new key provider
        const keyProvider = new ClusterKeyProvider(keyProviderConfig);

        // Subscribe to key update channels
        if (!await keyProvider.setupSubscriptions()) throw new Error(`Failed to subscribe to update channels, will not continue setup`);

        return keyProvider;
    }
}

export const clusterKeyProvider: KeyProvider = async (keyProviderConfig: KeyProviderConfig) => ClusterKeyProvider.factory(keyProviderConfig);
