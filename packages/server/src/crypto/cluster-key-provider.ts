import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {AbstractClusterProvider, LockOptions} from "../cluster/abstract-cluster-provider.js";
import type {KeyProvider, KeyProviderConfig} from "../types.js";
import type {ConnectorKeys} from "../types.js";
import {sleep} from "../helpers/utils.js";
import {is} from "typia";
import type {ClusterJob} from "../cluster/cluster-job.js";
import {ClusterMessenger} from "../cluster/cluster-messenger.js";
import type {ClusterMessengerConfig} from "../cluster/cluster-messenger.js";
import {webcrypto} from "crypto";

type ClusterConnectorKeys = {
    connectorKeys: ConnectorKeys,
    currentStart?: number,
    prevConnectorKeys?: ConnectorKeys,
    prevExpire?: number,
}

interface GenerateClusterKeysConfig {
    onlyIfStoreIsEmpty?: boolean,
    onNewKeyStart?: () => void,
    clusterJob?: ClusterJob,
}

interface UpdateJwksMessage {
    uniqueId: string,
    event: string,
    payload?: string,
    clusterConnectorKeys?: ClusterConnectorKeys
}

class ClusterKeyProvider extends AbstractKeyProvider {
    
    private readonly constants = {
        MAX_INITIALIZE_RETRIES: 10,
        CURR_JWKS_START_DELAY_SECS: 2 * 60 * 1000, // 2 minutes
        MAX_CURR_JWKS_START_DELAY_SECS: 10 * 60 * 1000, // 10 minutes
        PREV_JWKS_EXPIRATION_SECS: 10 * 60 * 1000, // 10 minutes
        MAX_PREV_JWKS_EXPIRATION_SECS: 3600 * 1000, // 1 hour
        _PREFIX: "key-provider",
        CONNECTOR_KEYS: "connector-keys",
        LISTENING_CHANNEL: "listening-channel",
        UPDATE_JWKS: "update-jwks",
    } as const;

    private clusterProvider: AbstractClusterProvider;

    private constructor(keyProviderConfig: KeyProviderConfig) {
        super(keyProviderConfig);

        // Check for a cluster provider
        if (keyProviderConfig.clusterProvider === undefined) {
            throw new Error(`Cannot initialize ${this.constructor.name} without a cluster provider.`);
        }

        // Store reference to the cluster provider
        this.clusterProvider = keyProviderConfig.clusterProvider;
    }

    protected async generateKeys(): Promise<ConnectorKeys> {

        // Keep track of the number of attempts
        let attempt = 1;

        do {
            //todo: change this to handle keys that aren't active yet
            const connectorKeys = await this.getConnectorKeysFromCluster();

            // Return the keys from the cluster
            if (connectorKeys) return connectorKeys;

            // Generate cluster keys
            const clusterConnectorKeys = await this.generateClusterKeys({});

            // Return the keys from cluster generation
            //todo: change this to handle keys that aren't active yet
            if (clusterConnectorKeys) return clusterConnectorKeys.connectorKeys;

            // Add wait period before next attempt
            await sleep(attempt *  500);
        } while(attempt <= this.constants.MAX_INITIALIZE_RETRIES);

        throw new Error(`Failed to generate keys after ${this.constants.MAX_INITIALIZE_RETRIES} attempts`);
    }

    private async generateClusterKeys(config: GenerateClusterKeysConfig): Promise<ClusterConnectorKeys | null> {

        // Setup lock options
        const lockOptions: LockOptions = {
            key: `${this.constants._PREFIX}:${this.constants.UPDATE_JWKS}`,
            ttl: 60,
        };

        // Attempt to obtain a lock
        const lock = await this.clusterProvider.lock(lockOptions);

        // Calculate end of lock time
        const endOfLockTime = Date.now()/1000 + lockOptions.ttl;

        // Check for no lock
        if (!lock) {
            this.keyProviderConfig.pinoLogger?.debug(`Could not obtain lock, cannot generate cluster keys`);
            return null;
        }

        // Grab the latest existing keys
        const clusterConnectorKeys = await this.getKeysFromCluster();

        // Check for existing keys and config flag
        if (clusterConnectorKeys && config.onlyIfStoreIsEmpty) {
            this.keyProviderConfig.pinoLogger?.debug(`Keys exists in store, using existing keys`);
            return clusterConnectorKeys;
        }

        // Check if the current key has not yet started
        if (clusterConnectorKeys?.currentStart &&
            clusterConnectorKeys?.currentStart + 1 > Date.now()/1000 &&
            clusterConnectorKeys?.currentStart < Date.now()/1000 + this.constants.MAX_CURR_JWKS_START_DELAY_SECS) {

            this.keyProviderConfig.pinoLogger?.warn(`New current key has not yet started, will not create new cluster key`);
            await config.clusterJob?.status(`New current key has not yet started (${clusterConnectorKeys.currentStart}), will not create new cluster key`);
            return null;
        }

        // Check if the previous key has NOT expired AND the expiration timestamp is reasonable
        if (clusterConnectorKeys?.prevExpire &&
            clusterConnectorKeys?.prevExpire + 1 > Date.now()/1000 &&
            clusterConnectorKeys?.prevExpire < Date.now()/1000 + this.constants.MAX_PREV_JWKS_EXPIRATION_SECS) {

            this.keyProviderConfig.pinoLogger?.warn(`Previous key has not yet expired, will not create new cluster key`);
            await config.clusterJob?.status(`Previous key has not yet expired (${clusterConnectorKeys.prevExpire}), will not create new cluster key`);
            return null;
        }

        // Send out start job message
        await config.clusterJob?.start();

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
        await config.clusterJob?.status(`Keys created, about to store if lock still exists`);

        // Create a cluster messenger
        const uniqueId = webcrypto.randomUUID();
        const clusterMessengerConfig: ClusterMessengerConfig = {
            command: "update-jwks", //todo: make constant
            clusterProvider: this.clusterProvider,
            targetChannel: `${this.constants._PREFIX}:${this.constants.LISTENING_CHANNEL}`,
        }

        // Advise all listeners of the pending update (in case the future publish is missed)
        if (newClusterConnectorKeys.currentStart) {
            await ClusterMessenger.messageObj<UpdateJwksMessage>(clusterMessengerConfig, {
                uniqueId: uniqueId,
                event: "pending-new-jwks",
                payload: endOfLockTime.toString()
            });

            // todo: > clients that receive this should set a timeout for the above seconds to run the GET_JWKS function
        }

        // // Double check lock status
        // const lockStatus = await this.clusterProvider.isLocked(lockOptions);
        //
        // // Check no longer have lock
        // if (!lockStatus) {
        //     if (newClusterConnectorKeys.currentStart) {
        //         await ClusterMessenger.messageObj<UpdateJwksMessage>(clusterMessengerConfig, {
        //             uniqueId: uniqueId,
        //             event: "cancel-pending-new-jwks",
        //         });
        //     }
        //
        //     this.keyProviderConfig.pinoLogger?.warn(`No longer have lock, will not store new keys`);
        //     return null;
        // }

        // Store the keys with no expiration
        const storeResult = await this.clusterProvider.store(`${this.constants._PREFIX}:${this.constants.CONNECTOR_KEYS}`, newClusterConnectorKeysJSON, null, lockOptions.key);

        if (!storeResult) {
            // Advise all listeners to cancel the pending update request
            if (newClusterConnectorKeys.currentStart) {
                await ClusterMessenger.messageObj<UpdateJwksMessage>(clusterMessengerConfig, {
                    uniqueId: uniqueId,
                    event: "cancel-pending-new-jwks",
                });
            }

            this.keyProviderConfig.pinoLogger?.error(`Failed to store updated keys`);
            return null;
        }

        // Advise all listeners that a new jwk is available and will be ready for use soon
        await ClusterMessenger.messageObj<UpdateJwksMessage>(clusterMessengerConfig, {
            uniqueId: uniqueId,
            event: "new-jwks-available",
            clusterConnectorKeys: newClusterConnectorKeys,
        });
        // todo: --> clients that receive this should cancel their earlier timeout for the same unique id. if they have a key earlier than the <start time>, then run the GET_JWKS function ///// ****OR JUST USE THIS DATA HERE

        // Continuously pass the status message (if using a cluster job)
        await (async function statusUpdateFunc() {

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
            await config.clusterJob.status(`Waiting until new key start to update Keycloak cache. Time remaining: ${secondsUntilNewKeyStart} seconds`);

            // Self licking ice cream cone
            setTimeout(statusUpdateFunc, 10000);
        })();

        // Calculate remaining time until start
        const secondsUntilNewKeyStart = (newClusterConnectorKeys.currentStart) ? Math.max(newClusterConnectorKeys.currentStart - Date.now()/1000, 0) : 0;

        // Store a local reference to the callback
        const onNewKeyStart = config.onNewKeyStart;

        // Configure a timeout to pass final messages and handle callback
        setTimeout(async() => {
            this.keyProviderConfig.pinoLogger?.debug(`New key has started, executing callback`);

            // Execute the callback
            if (onNewKeyStart) await onNewKeyStart();

            this.keyProviderConfig.pinoLogger?.debug(`Finished executing new key started callback`);

            // Send job finish notification
            config.clusterJob?.finish();
        }, secondsUntilNewKeyStart * 1000);

        // Release the held lock
        const unlock = await this.clusterProvider.unlock(lockOptions);

        if (!unlock) {
            const lockExpiresIn = Math.round(endOfLockTime - Date.now() / 1000);
            const warnMsg = (lockExpiresIn > 0) ? `Lock will expire in ${lockExpiresIn} seconds` : `Lock already expired ${Math.abs(lockExpiresIn)} seconds ago.`;
            this.keyProviderConfig.pinoLogger?.warn(`Failed to unlock cluster key generation lock. ${warnMsg}`);
        }

        return newClusterConnectorKeys;
    }

    private getConnectorKeysFromCluster = async (): Promise<ConnectorKeys | null> => (await this.getKeysFromCluster())?.connectorKeys ?? null;

    private async getKeysFromCluster(): Promise<ClusterConnectorKeys | null> {
        const keysJSON = await this.clusterProvider.get(`${this.constants._PREFIX}:${this.constants.CONNECTOR_KEYS}`);

        // Check for any found value
        if (keysJSON === null) return null;

        let keys;

        try {
            // Attempt to restore the data
            keys = JSON.parse(keysJSON);
        } catch (e) {
            this.keyProviderConfig.pinoLogger?.error(`Stored key string is not valid JSON`);
            return null;
        }

        // Check if the returned data is our expected type
        if (!is<ClusterConnectorKeys>(keys)) {
            this.keyProviderConfig.pinoLogger?.error(`Stored key string is valid JSON, but does not match expected type`);
            return null;
        }

        // Return the correct keys
        return keys;
    }

    private async setupSubscriptions() {
        const listeningChannel = `${this.constants._PREFIX}:${this.constants.LISTENING_CHANNEL}`;

        try {
            // Clear existing subscription
            const unsubResults = await this.clusterProvider.unsubscribe(listeningChannel, this.pubSubMessageHandler);

            // Check the results of the unsubscription
            if (!unsubResults) this.keyProviderConfig.pinoLogger?.debug(`Failed to unsubscribe from ${listeningChannel}`);

            // Add subscription
            const subResults = await this.clusterProvider.subscribe(listeningChannel, this.pubSubMessageHandler);

            // Check the result of the subscription
            if (!subResults) this.keyProviderConfig.pinoLogger?.debug(`Failed to subscribe to ${listeningChannel}`);

            return subResults;

        } catch (e) {
            this.keyProviderConfig.pinoLogger?.error(`Error while subscribing to ${listeningChannel}: ${e}`);
            return false;
        }
    }

    private pubSubMessageHandler(a: any,b: any,c: any,d: any) {
        console.log(a,b,c,d);
        debugger;
        //todo: handle messages
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