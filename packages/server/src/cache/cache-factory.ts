import type {CacheProviderConfig} from "./cache-provider.js";
import {ClusterCacheProvider} from "./cluster-cache-provider.js";
import {CacheProvider} from "./cache-provider.js";

export const cacheFactory = <T extends NonNullable<unknown>, A extends any[] = any[]>(config: CacheProviderConfig<T, A>) => {
    // Check for a cluster provider
    if (config.clusterProvider) {
        return new ClusterCacheProvider<T, A>(config);
    }

    return new CacheProvider<T, A>(config);
}