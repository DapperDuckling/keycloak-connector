import {
    CacheProvider,
    type CacheProviderConfig,
    type CacheResult,
    type WrappedCacheMissCallback
} from "./cache-provider.js";
import {AbstractClusterProvider} from "../cluster/index.js";
import {LRUCache} from "lru-cache";
import {
    promiseWait,
    sleep,
    ttlFromExpiration,
    WaitTimeoutError
} from "../helpers/utils.js";
import {is} from "typia";
import {setImmediate} from "timers";
import type {Deferred} from "@dapperduckling/keycloak-connector-common";
import {deferredFactory, isObject} from "@dapperduckling/keycloak-connector-common";

type UpdateDataMessage<T> = {
    data: T,
    key: string,
}

export class ClusterCacheProvider<T extends NonNullable<unknown>, A extends any[] = any[]> extends CacheProvider<T, A> {
    private readonly constants = {
        _PREFIX: "cluster-cache",
        UPDATE_DATA: "update-data",
        LISTENING_CHANNEL: "listening-channel",
    } as const;
    private readonly clusterProvider: AbstractClusterProvider;
    private readonly pendingRefresh;
    private readonly lockOptions: {key: string, ttl: number};

    constructor(config: CacheProviderConfig<T, A>) {
        super(config);

        // Check for a cluster provider
        if (config.clusterProvider === undefined) {
            throw new Error(`Cannot initialize ${this.constructor.name} without a cluster provider.`);
        }

        // Build the pending refresh LRU
        this.pendingRefresh = new LRUCache<string, Deferred<T | undefined>>({
            max: 10000,
            ttl: (this.config.maxWaitSecs ?? CacheProvider.MAX_WAIT_SECS) * 1000,
        });

        // Build the lock options
        this.lockOptions = {
            key: `${this.constants._PREFIX}:${this.constants.UPDATE_DATA}:${this.config.title}`, //TODO: Ducky, this should be based off of the key of the individual item
            ttl: 60,
        }

        // Store reference to the cluster provider
        this.clusterProvider = config.clusterProvider;

    }

    override async invalidateCache(key: string) {
        await super.invalidateCache(key);

        // Grab a lock, force breaking any existing locks
        await this.clusterProvider.lock(this.lockOptions, true);

        // Grab the storage key
        const storageKey = this.getStorageKey(key);

        // Invalidate cluster cache
        await this.clusterProvider.remove(storageKey);

        // Unlock our own lock
        await this.clusterProvider.unlock(this.lockOptions);
    }

    private handleIncomingUpdateData = (message: unknown) => {

        // Check for a non update data message
        if (!is<UpdateDataMessage<any>>(message)) {
            return;
        }

        // Assume returned data is correct type, no way of checking at runtime
        const data = message.data as T | undefined;

        // Update the local cache with the new token message
        this.cachedResult.set(message.key, data);

        // Call any pending promises
        const pendingRefresh = this.pendingRefresh.get(message.key);
        if (pendingRefresh) {
            setImmediate(() => {
                pendingRefresh.resolve(data)
            });
        }
    }

    private getStorageKey(key: string) {
        return `${this.constants._PREFIX}:${this.config.title}:${key}`;
    }

    protected override async handleCacheMiss(key: string, wrappedCacheMissCallback: WrappedCacheMissCallback<T>, expiration?: number): Promise<CacheResult<T>> {

        // Start listening to cluster messages for this update id
        const listeningChannel = `${this.constants._PREFIX}:${this.constants.LISTENING_CHANNEL}:${this.config.title}:${key}`;
        await this.clusterProvider.subscribe(listeningChannel, this.handleIncomingUpdateData);

        // Track the lock flag
        let lock = false;

        // Grab the storage key
        const storageKey = this.getStorageKey(key);

        let data: T | undefined;

        try {
            // Grab an already completed update request stored with the cluster provider
            const existingResult = await this.clusterProvider.getObject<T>(storageKey);
            if (existingResult) return {
                data: existingResult,
            };

            // Record the final retry time
            const finalRetryTimeMs = Date.now() + (this.config.maxWaitSecs ?? CacheProvider.MAX_WAIT_SECS) * 1000;

            do {
                // Grab a lock
                lock = await this.clusterProvider.lock(this.lockOptions); // ** TODO: DO BELIEVE THIS IS A PROBLEM. Needs more specific locking key for some operations

                // Check for a lock
                if (lock) break;

                // Did not obtain a lock, wait for result from elsewhere

                // Store the pending refresh
                const deferredRefresh = deferredFactory<T | undefined>();
                this.pendingRefresh.set(key, deferredRefresh);

                try {
                    // Wait for a pending refresh
                    const updateDataResult = await promiseWait<T | undefined>(deferredRefresh.promise, finalRetryTimeMs);
                    if (updateDataResult) return {
                        data: updateDataResult
                    }
                } catch (e) {
                    if (e instanceof WaitTimeoutError) {
                        // Log this in order to inform the owner they may need to increase the wait timeout
                        this.config.pinoLogger?.warn(`Timed out waiting for cache cluster update to occur. May consider increasing the wait time or investigating why the request is taking so long.`);
                    }
                }
            } while (
                Date.now() <= finalRetryTimeMs &&       // Check exit condition
                await sleep(25, 150)   // Add some random sleep for next loop
            )

            // Execute the wrapped cache miss callback
            data = await wrappedCacheMissCallback();

            // Check for resultant data
            if (data !== undefined) {
                // Calculate ttl
                const ttl = ttlFromExpiration(expiration) ?? this.config.ttl;

                // Store the result in the cluster
                await this.clusterProvider.storeObject(storageKey, data, Math.max(1, ttl), this.lockOptions.key);

                // Return the new data
                return {
                    data: data,
                    dataGenerator: true,
                }
            }
        } catch (e) {
            // Log error
            if (isObject(e)) this.config.pinoLogger?.info(e);
            this.config.pinoLogger?.info(`Failed to perform data update`);

        } finally {

            // Unsubscribe from the listener
            await this.clusterProvider.unsubscribe(listeningChannel, this.handleIncomingUpdateData);

            // Check for lock
            if (lock) {
                // Broadcast result to the cluster
                await this.clusterProvider.publish<UpdateDataMessage<T | undefined>>(listeningChannel, {
                    key: key,
                    data: data,
                });

                // Release the lock
                await this.clusterProvider.unlock(this.lockOptions);
            }

        }

        return undefined;
    }
}
