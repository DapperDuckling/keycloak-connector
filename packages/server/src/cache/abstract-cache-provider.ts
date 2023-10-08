import {AbstractClusterProvider} from "../cluster/index.js";
import type {Logger} from "pino";
import {EventEmitter} from "node:events";
import {LRUCache} from "lru-cache/dist/mjs/index.js";

export type AbstractCacheProviderConfig = {
    title: string,
    ttl: number,
    maxWaitTime?: number,
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
}

export class AbstractCacheProvider<T extends NonNullable<unknown>> {

    protected readonly config: AbstractCacheProviderConfig;
    protected readonly updateEmitter = new EventEmitter();
    protected readonly instanceLevelUpdateLock;
    protected readonly cachedResult;

    constructor(config: AbstractCacheProviderConfig) {
        // Update pino logger reference
        if (config.pinoLogger) {
            config.pinoLogger = config.pinoLogger.child({"Source": "CacheProvider"}).child({"Source": config.title});
        }

        // Add generic error handler to the token update emitter
        this.updateEmitter.on('error', (e) => {
            // Log the error
            this.config.pinoLogger?.error(e, `Error in cache`);
        });
        
        // Build the LRU caches
        this.instanceLevelUpdateLock = new LRUCache<string, string>({
            max: 10000,
            ttl: config.ttl,
        });
        
        this.cachedResult = new LRUCache<string, T>({
            max: 10000,
            ttl: config.ttl,
        });

        // Store the config
        this.config = config;
    }


}