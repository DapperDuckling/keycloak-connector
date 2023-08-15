import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import type {KeyProvider, KeyProviderConfig} from "../types.js";

class ClusterKeyProvider extends AbstractKeyProvider {

    private clusterProvider: AbstractClusterProvider;

    private constructor(keyProviderConfig: KeyProviderConfig) {
        super();

        this.clusterProvider = clusterProvider;
    }

    static async factory(keyProviderConfig: KeyProviderConfig) {
        return new ClusterKeyProvider(keyProviderConfig);
    }
}

export const clusterKeyProvider: KeyProvider = async (keyProviderConfig: KeyProviderConfig) => ClusterKeyProvider.factory(keyProviderConfig);