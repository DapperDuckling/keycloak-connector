import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import type {KeyProvider, KeyProviderConfig} from "../types.js";
import type {ConnectorKeys} from "../types.js";
import {sleep} from "../helpers/utils.js";
import {is} from "typia";

type ClusterConnectorKeys = {
    connectorKeys: ConnectorKeys,
    currentStart: number,
    prevConnectorKeys: ConnectorKeys,
    prevExpire: number,
}

class ClusterKeyProvider extends AbstractKeyProvider {
    
    private readonly constants = {
        MAX_INITIALIZE_RETRIES: 10,
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
        let connectorKeys;

        do {
            connectorKeys = await this.getConnectorKeysFromCluster();

            // Return the keys from the cluster
            if (connectorKeys) return connectorKeys;

            // Generate cluster keys
            connectorKeys = await this.generateClusterKeys();

            // Return the keys from cluster generation
            if (connectorKeys) return connectorKeys;

            // Add wait period before next attempt
            await sleep(attempt *  500);
        } while(attempt <= this.constants.MAX_INITIALIZE_RETRIES);

        throw new Error(`Failed to generate keys after ${this.constants.MAX_INITIALIZE_RETRIES} attempts`);
    }

    private async generateClusterKeys(onlyIfStoreIsEmpty = false): Promise<ConnectorKeys | null> {

        // Attempt to obtain a lock
        const lock = await this.clusterProvider.lock({
            key: `${this.constants._PREFIX}:${this.constants.UPDATE_JWKS}`,
            ttl: 60,
            maxWaitMs: 0,
        });

        // Check for no lock
        if (!lock) {
            this.keyProviderConfig.pinoLogger?.debug(`Could not obtain lock, cannot generate cluster keys`);
            return null;
        }

        // Grab the latest existing keys
        const clusterConnectorKeys = await this.getKeysFromCluster();

        // Check for existing keys and config flag
        if (clusterConnectorKeys && onlyIfStoreIsEmpty) return clusterConnectorKeys.connectorKeys;

        // Check previous JWKS expiration time
        if (clusterConnectorKeys?.prevExpire > ) {

        }

        // - get the previous jwks expiration time, is it between now+1 and PREVIOUS_EXPIRATION+1 time (has it not expired AND is it a valid time, not something super far in the future)
        // --> broadcast new message "CMD:update-jwks:<time>:error:cannot update, previous token does not expire until <unixtimestamp>" to <job listening channel>
        //
        // - broadcast new message "CMD:update-jwks:<time>:started" to <job listening channel>
        // - generate a new jwks
        //
        // - broadcast new message "CMD:pending-new-jwks:<unique id>:<check at END OF LOCK time>"
        // --> clients that receive this should set a timeout for the above seconds to run the GET_JWKS function
        //
        //
        // - store (IF THE LOCK STILL EXISTS---**will need a special lua script to do this**): {
        //     currentJWKS: <data>
        //         currentJwksStart: <unixtimestamp + 1 minute>
        //     previousJWKS: <data>
        //         previousJwksExpiration: <unixtimestamp + 10 minutes>
        // }
        //
        // - if not successful, do nothing
        // - else...
        //
        // - broadcast new message "CMD:new-jwks:<new jwks time>:<unique id>:<new jwks start time>:<previous jwks expiration time>"
        // --> clients that receive this should cancel their earlier timeout for the same unique id. if they have a key earlier than the <start time>, then run the GET_JWKS function
        //
        // - broadcast new message to <job listening channel> "CMD:update-jwks:<time>:waiting until start to force update keycloak"
        // (do i do this) set a timer until the jwksstart time to then send keycloak a message with the new key and have it get a new list of valid keys?
        //
        //
        //     - broadcast new message to <job listening channel> "CMD:update-jwks:<time>:finished"
        // - release lock


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
        return keys.connectorKeys;
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

    private pubSubMessageHandler() {

    }

    static async factory(keyProviderConfig: KeyProviderConfig) {
        // Create a new key provider
        const keyProvider = new ClusterKeyProvider(keyProviderConfig);

        // Subscribe to key update channels
        if (!await keyProvider.setupSubscriptions()) throw new Error(`Failed to subscribe to update channels, will not continue setup`);


    }
}

export const clusterKeyProvider: KeyProvider = async (keyProviderConfig: KeyProviderConfig) => ClusterKeyProvider.factory(keyProviderConfig);