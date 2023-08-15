import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import type {KeyProvider, KeyProviderConfig} from "../types.js";
import type {ConnectorKeys} from "../types.js";
import {isObject, sleep} from "../helpers/utils.js";

class ClusterKeyProvider extends AbstractKeyProvider {

    private readonly MAX_INITIALIZE_RETRIES = 10;
    private readonly keyNames = {
     _PREFIX: "key-provider:",
     CONNECTOR_KEYS: "connector-keys",
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
        } while(attempt <= this.MAX_INITIALIZE_RETRIES);
    }

    private async generateClusterKeys(onlyIfStoreIsEmpty = false): Promise<ConnectorKeys | null> {


        // Obtain lock



        if (onlyIfStoreIsEmpty) {
            // Check again for valid keys
            const connectorKeys = await this.getKeysFromCluster();

            if (connectorKeys) return connectorKeys;
        }
    }

    private async getKeysFromCluster() {
        const keysJSON = await this.clusterProvider.get(`${this.keyNames._PREFIX}${this.keyNames.CONNECTOR_KEYS}`);

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

    static async factory(keyProviderConfig: KeyProviderConfig) {
        // Create a new key provider
        const keyProvider = new ClusterKeyProvider(keyProviderConfig);

        // Subscribe to
    }
}

export const clusterKeyProvider: KeyProvider = async (keyProviderConfig: KeyProviderConfig) => ClusterKeyProvider.factory(keyProviderConfig);