import {
    CacheProvider,
    type CacheProviderConfig,
    type CacheResult,
    type WrappedCacheMissCallback
} from "./cache-provider.js";
import {AbstractClusterProvider} from "../cluster/index.js";
import {LRUCache} from "lru-cache/dist/mjs/index.js";
import {type Deferred, deferredFactory, promiseWait, sleep, WaitTimeoutError} from "../helpers/utils.js";
import {is} from "typia";
import {setImmediate} from "timers";

type UpdateDataMessage<T> = {
    data: T,
    key: string,
}

class ClusterCacheProvider<T extends NonNullable<unknown>, A extends any[] = any[]> extends CacheProvider<T, A> {
    private readonly constants = {
        _PREFIX: "cluster-cache",
        UPDATE_DATA: "update-data",
        LISTENING_CHANNEL: "listening-channel",
    } as const;
    private readonly clusterProvider: AbstractClusterProvider;
    private readonly pendingRefresh;

    private constructor(config: CacheProviderConfig<T>) {
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

        // Store reference to the cluster provider
        this.clusterProvider = config.clusterProvider;

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

    protected override async handleCacheMiss(key: string, wrappedCacheMissCallback: WrappedCacheMissCallback<T>): Promise<CacheResult<T>> {

        // Start listening to cluster messages for this update id
        const listeningChannel = `${this.constants._PREFIX}:${this.constants.LISTENING_CHANNEL}:${this.config.title}:${key}`;
        await this.clusterProvider.subscribe(listeningChannel, this.handleIncomingUpdateData);

        // Track the lock flag
        let lock = false;

        // Build the lock options
        const lockOptions = {
            key: `${this.constants._PREFIX}:${this.constants.UPDATE_DATA}:${this.config.title}`,
            ttl: 60,
        }

        // Build the storage key
        const storageKey = `${this.constants._PREFIX}:${this.config.title}:${key}`;

        try {
            // Grab an already completed update request stored with the cluster provider
            const existingResult = await this.clusterProvider.getObject<T>(storageKey);
            if (existingResult) return {
                data: existingResult,
            };

            // Record the final retry time
            const finalRetryTimeMs = Date.now() + (this.config.maxWaitSecs ?? CacheProvider.MAX_WAIT_SECS) * 1000;

            do {
                // Store the pending refresh
                const deferredRefresh = deferredFactory<T | undefined>();
                this.pendingRefresh.set(key, deferredRefresh);

                // Grab a lock
                lock = await this.clusterProvider.lock(lockOptions);

                // Check for no lock
                if (!lock) {
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

                    // Timed out or received no updated data from cluster
                    continue;
                }

                // Execute the wrapped cache miss callback
                const data = await wrappedCacheMissCallback();

                // Check for a new token set
                if (data) {
                    // Store the result in the cluster
                    await this.clusterProvider.storeObject(storageKey, data, this.config.ttl, lockOptions.key);

                    // Broadcast result to the cluster
                    await this.clusterProvider.publish<UpdateDataMessage<T>>(listeningChannel, {
                        key: key,
                        data: data,
                    });

                    // Return the new data
                    return {
                        data: data,
                        dataGenerator: true,
                    }
                }
            } while (
                Date.now() <= finalRetryTimeMs &&       // Check exit condition
                await sleep(25, 150)   // Add some random sleep for next loop
            )
        } catch (e) {
            // Log error
            this.config.pinoLogger?.info(e, `Failed to perform data update`);

        } finally {

            // Unsubscribe from the listener
            await this.clusterProvider.unsubscribe(listeningChannel, this.handleIncomingUpdateData);

            // Release the lock
            if (lock) await this.clusterProvider.unlock(lockOptions);

        }

        return undefined;
    }
}