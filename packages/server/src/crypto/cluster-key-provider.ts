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
        // Check for the first initiation
        if (!this.connectorKeys) await this.initialize();

        return AbstractKeyProvider.createKeys();
    }

    private async initialize() {

        let attempt = 1;
        let connectorKeys: ConnectorKeys;

        do {
            // Grab the current set of keys from the cluster provider
            const result = await this.clusterProvider.get(`${this.keyNames._PREFIX}${this.keyNames.CONNECTOR_KEYS}`);

            if (result) {
                try {
                    const unknownObj = JSON.parse(result);

                    // Check for expected values
                    if (!isObject(unknownObj) )

                }
                break;
            }

            // Add wait period before next attempt
            await sleep(attempt *  500);

        } while(attempt <= this.MAX_INITIALIZE_RETRIES);

        return true;
    }

    static async factory(keyProviderConfig: KeyProviderConfig) {
        return new ClusterKeyProvider(keyProviderConfig);
    }
}

export const clusterKeyProvider: KeyProvider = async (keyProviderConfig: KeyProviderConfig) => ClusterKeyProvider.factory(keyProviderConfig);