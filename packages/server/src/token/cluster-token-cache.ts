import type {ClusterCacheProvider} from "../cache/cluster-cache-provider.js";
import {CacheProvider} from "../cache/cache-provider.js";

export const clusterTokenCacheProvider: ClusterCacheProvider = async (...args: ConstructorParameters<typeof CacheProvider>) => ClusterTokenCache.provider(...args);