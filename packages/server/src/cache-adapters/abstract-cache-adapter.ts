import type {Logger} from "pino";
import {AbstractClusterProvider} from "../cluster/index.js";
import type {CacheProvider} from "../cache/cache-provider.js";
import type {JWTPayload} from "jose/dist/types/types.js";

export type CacheAdapterConfig = {
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
}

export abstract class AbstractCacheAdapter<T extends NonNullable<unknown>, A extends any[] = any[]> {
    protected config: CacheAdapterConfig;
    protected abstract cacheProvider: CacheProvider<T, A>;
    protected cacheConfig: CacheAdapterConfig;

    protected constructor(config: CacheAdapterConfig) {
        this.config = config;
        this.cacheConfig = {
            ...this.config.pinoLogger && {pinoLogger: this.config.pinoLogger},
            ...this.config.clusterProvider && {clusterProvider: this.config.clusterProvider},
        };
    }

    abstract invalidateFromJwt(validatedJwt: string): void;

    async invalidateCache(key: string) {
        await this.cacheProvider.invalidateCache(key);
    }

}