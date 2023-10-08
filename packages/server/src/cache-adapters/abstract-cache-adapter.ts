import {Logger} from "pino";
import {AbstractClusterProvider} from "../cluster/index.js";
import type {CacheProvider} from "../cache/cache-provider.js";

export type CacheAdapterConfig = {
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
}

export abstract class AbstractCacheAdapter<T, A> {
    protected config: CacheAdapterConfig;
    protected cacheProvider: CacheProvider<T, A>;
    protected cacheConfig: CacheAdapterConfig;

    protected constructor(config: CacheAdapterConfig) {
        this.config = config;
        this.cacheConfig = {
            ...this.config.pinoLogger && {pinoLogger: this.config.pinoLogger},
            ...this.config.clusterProvider && {clusterProvider: this.config.clusterProvider},
        };
    }

}