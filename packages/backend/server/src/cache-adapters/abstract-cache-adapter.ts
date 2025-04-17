import type {Logger} from "pino";
import {AbstractClusterProvider} from "../cluster/index.js";
import type {CacheProvider} from "../cache/cache-provider.js";

export type CacheAdapterConfig = {
    _initialization?: symbol,
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
}

export abstract class AbstractCacheAdapter<T extends NonNullable<unknown>, A extends any[] = any[]> {
    private static _initialization = Symbol();
    protected config: CacheAdapterConfig;
    protected abstract cacheProvider: CacheProvider<T, A>;
    protected cacheConfig: CacheAdapterConfig;

    protected constructor(config: CacheAdapterConfig) {
        this.config = config;

        // Ensure the initialization symbol is correct
        if (config._initialization !== AbstractCacheAdapter._initialization) {
            throw new Error("Developer error. Do not initialize a cache adapter using `new`, use `AbstractCacheAdapter.init(AdapterName, config)`");
        }

        this.cacheConfig = {
            ...this.config.pinoLogger && {pinoLogger: this.config.pinoLogger},
            ...this.config.clusterProvider && {clusterProvider: this.config.clusterProvider},
        };
    }

    abstract invalidateFromJwt(validatedJwt: string): void;

    async invalidateCache(key: string) {
        await this.cacheProvider.invalidateCache(key);
    }

    static async init<
        T extends AbstractCacheAdapter<any, any>,
        C extends CacheAdapterConfig
    >(
        AdapterClass: new (config: C) => T,
        config: C
    ): Promise<T> {
        const instance = new AdapterClass({
            ...config,
            _initialization: this._initialization,
        });
        await instance.cacheProvider.initialize();
        return instance;
    }

}
