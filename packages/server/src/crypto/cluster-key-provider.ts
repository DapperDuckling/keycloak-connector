import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import type {KeyProvider, KeyProviderConfig} from "../types.js";
import type {ConnectorKeys} from "../types.js";
import {isObject, sleep} from "../helpers/utils.js";

class ClusterKeyProvider extends AbstractKeyProvider {
    
    private readonly constants = {
        MAX_INITIALIZE_RETRIES: 10,
        _PREFIX: "key-provider",
        CONNECTOR_KEYS: "connector-keys",
        LISTENING_CHANNEL: "listening-channel"
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
            connectorKeys = await this.getKeysFromCluster();

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


        // Obtain lock



        if (onlyIfStoreIsEmpty) {
            // Check again for valid keys
            const connectorKeys = await this.getKeysFromCluster();

            if (connectorKeys) return connectorKeys;
        }
    }

    private async getKeysFromCluster(): Promise<ConnectorKeys | false | null> {
        const keysJSON = await this.clusterProvider.get(`${this.constants._PREFIX}:${this.constants.CONNECTOR_KEYS}`);

        // Check for any found value
        if (keysJSON === null) return null;

        let keys;

        try {
            // Attempt to restore the data
            keys = JSON.parse(keysJSON);
        } catch (e) {
            this.keyProviderConfig.pinoLogger?.error(`Stored key string is not valid JSON`);
            return false;
        }

        // Check if the returned data is our expected type
        if (!this.isConnectorKeys(keys)) {
            this.keyProviderConfig.pinoLogger?.error(`Stored key string is valid JSON, but does not match expected type`);
            return false;
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