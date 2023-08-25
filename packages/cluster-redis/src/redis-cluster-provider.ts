import type {ClusterConfig, Listener, LockOptions} from "keycloak-connector-server";
import {AbstractClusterProvider, BaseClusterEvents} from "keycloak-connector-server";
import {webcrypto} from "crypto";
import * as fs from "fs";
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import Redis, {Cluster} from "ioredis";
import {is} from "typia";
import type {
    ClusterMode,
    RedisClient,
    RedisClusterConfig,
} from "./types.js";
import {RedisClusterEvents} from "./types.js";
import type {DelIfLocked, SetIfLockedArgs} from "./ioredis.js";
import {EventEmitter} from "node:events";

export class RedisClusterProvider extends AbstractClusterProvider<RedisClusterEvents> {

    protected override clusterConfig: RedisClusterConfig;
    private readonly client: RedisClient;
    private readonly subscriber: RedisClient;
    private connectionData = {
        clientConnected: false,
        subscriberConnected: false,
        subscriberHadToReconnect: false,
    }
    private readonly uniqueClientId: string;
    private readonly subscriptionListeners = new EventEmitter();
    private readonly SUB_EVENT_PREFIX = `-`; // Used when sending events to the subscription event emitter to ensure an "error" is never sent

    constructor(config?: RedisClusterConfig) {
        config ??= {};
        super(config);

        // Generate a unique id for this client
        this.uniqueClientId = `${Date.now()}-${webcrypto.randomUUID()}`;

        // Handle each cluster mode config differently
        this.clusterConfig = this.generateDefaults(config);

        // Ensure connections are happening over TLS
        this.ensureTlsConfig();

        // Ensure there is a prefix
        this.ensurePrefix();

        // // Register custom transformers
        // this.registerCustomTransformers();

        // Create a new redis client
        this.client = this.clusterConfig.clusterMode ?
            new Redis.Cluster([...this.clusterConfig.hostOptions ?? []], this.clusterConfig.clusterOptions) :
            new Redis(this.clusterConfig.redisOptions ?? {});

        // Register custom commands
        this.registerCustomCommands();

        // Create the pub-sub client
        const overrideOptions = {
            connectionName: `keycloak-connector-${this.uniqueClientId}-subscriber`
        }
        this.subscriber = this.isClientClusterMode(this.client) ? this.client.duplicate([], overrideOptions) : this.client.duplicate(overrideOptions);

        // Register event listeners
        this.registerEventListeners(this.client);
        this.registerEventListeners(this.subscriber);

        // Add cluster mode warning
        //todo: Test cluster mode
        if (config.clusterMode) this.clusterConfig.pinoLogger?.warn("**WARNING** Using Redis in cluster mode has not been thoroughly tested.");
    }

    private isClientClusterMode(client: RedisClient): client is Cluster {
        return client.isCluster;
    }

    private isClusterMode(): boolean {
        return this.clusterConfig.clusterMode ?? false;
    }

    private isConfigClusterMode(config: Partial<RedisClusterConfig>): config is ClusterMode {
        return config.clusterMode ?? false;
    }

    /** Removed due to ioredis not supporting transformers on custom commands. Would need to transform `evalsha` command **/
    // private registerCustomTransformers() {
    //     // Set setIfLocked argument transformer
    //     Redis.Command.setArgumentTransformer("setIfLocked", (args: any[]) => {
    //         // Ensure the arguments are correct
    //         if (!is<SetIfLockedArgs>(args)) {
    //             this.clusterConfig.pinoLogger?.error(`Input args for "setIfLocked" not as expected, cannot execute command.`);
    //         }
    //
    //         // Grab the individual args
    //         const [lockKey, lockValue, key, value] = args as SetIfLockedArgs;
    //
    //         // Return the re-organized arguments
    //         return [lockKey, key, lockValue, value];
    //     });
    //
    //     // Set delIfLocked argument transformer
    //     Redis.Command.setArgumentTransformer("delIfLocked", (args: any[]) => {
    //         // Ensure the arguments are correct
    //         if (!is<DelIfLocked>(args)) {
    //             this.clusterConfig.pinoLogger?.error(`Input args for "delIfLocked" not as expected, cannot execute command.`);
    //         }
    //
    //         // Grab the individual args
    //         const [lockKey, lockValue, keys] = args as DelIfLocked;
    //
    //         // Return the re-organized arguments (with dynamic number of keys)
    //         return [keys.length + 1, lockKey, ...keys, lockValue];
    //     });
    // }


    private registerCustomCommands() {
        // Get lua script directory
        const scriptDir = dirname(fileURLToPath(import.meta.url)) + '/lua-scripts/';

        // Register setIfLocked
        this.client.defineCommand("setIfLocked", {
            numberOfKeys: 2,
            lua: fs.readFileSync(`${scriptDir}/set-if-locked.lua`, 'utf8'),
        });

        // Register delIfLocked
        this.client.defineCommand("delIfLocked", {
            lua: fs.readFileSync(`${scriptDir}/del-if-locked.lua`, 'utf8'),
        });
    }

    private generateDefaults(config: RedisClusterConfig) {

        // Set the prefix variable
        if (process.env["CLUSTER_REDIS_PREFIX"]) config.prefix = process.env["CLUSTER_REDIS_PREFIX"];

        const defaultHostOption = {
            ...process.env["CLUSTER_REDIS_HOST"] && {host: process.env["CLUSTER_REDIS_HOST"]},
            ...process.env["CLUSTER_REDIS_PORT"] && {port: +process.env["CLUSTER_REDIS_PORT"]},
            ...config.redisOptions?.host && {host: config.redisOptions.host},
            ...config.redisOptions?.port && {port: config.redisOptions.port}
        }

        // Create a host options if not already declared
        config.hostOptions ??= [defaultHostOption];

        config.redisOptions = {
            ...defaultHostOption,
            ...process.env["CLUSTER_REDIS_USERNAME"] && {username: process.env["CLUSTER_REDIS_USERNAME"]},
            ...process.env["CLUSTER_REDIS_PASSWORD"] && {password: process.env["CLUSTER_REDIS_PASSWORD"]},
            connectionName: process.env["CLUSTER_REDIS_CLIENT_NAME"] ?? `keycloak-connector-${this.uniqueClientId}-client`,
            reconnectOnError: (err) => {
                // Reconnect on READONLY state to handle AWS ElastiCache primary replica changes
                const targetError = "READONLY";
                return err.message.includes(targetError);
            },
            connectTimeout: 60, // An initial connection should not take more than one minute
            ...!(process.env["CLUSTER_REDIS_DANGEROUSLY_DISABLE_TLS"]?.toLowerCase() === "true" || config.DANGEROUS_allowUnsecureConnectionToRedisServer) && {tls: {
                    ...process.env["CLUSTER_REDIS_TLS_SNI"] && {servername: process.env["CLUSTER_REDIS_TLS_SNI"]},
            }},
            ...config.prefix && {keyPrefix: config.prefix},
            ...config.redisOptions,
            lazyConnect: true,
        }

        return config;
    }

    private ensureTlsConfig() {
        // Ensure the connection is over TLS
        if (this.clusterConfig.redisOptions?.tls === undefined) {
            // Check for no dangerous override flag
            if (this.clusterConfig.DANGEROUS_allowUnsecureConnectionToRedisServer !== true && process.env["CLUSTER_REDIS_DANGEROUSLY_DISABLE_TLS"]?.toLowerCase() !== "true") {
                throw new Error(`Connection url does not not start with "rediss" disabling TLS connection to REDIS server. Will not connect via unsecure connection without override.`);
            }

            this.clusterConfig.pinoLogger?.warn("***DANGEROUS CONFIGURATION*** Connecting to REDIS server using unsecure connection!");
        }
    }

    private ensurePrefix(): void {

        // Check for a prefix
        if (this.clusterConfig.prefix !== undefined || process.env["CLUSTER_REDIS_NO_PREFIX"]?.toLowerCase() === "true") return;

        // No prefix, show a warning
        this.clusterConfig.pinoLogger?.warn("***CHECK CONFIGURATION*** It is highly recommended to set a prefix when using Redis in order to allow for easier permission management configuration.");

    }

    private registerEventListeners(client: RedisClient) {

        const isSubscriber = this.isClientClusterMode(client);
        const clientNameTag = isSubscriber ? "Subscriber" : "Client";

        // Register the event listeners
        client.on(RedisClusterEvents.READY, (msg: string) => {
            this.clusterConfig.pinoLogger?.debug(`Redis ${clientNameTag} ready to use`, msg);
            this.setIsConnected(isSubscriber, true);
            this.emitEvent(RedisClusterEvents.READY, msg);
        });
        client.on(RedisClusterEvents.END, (msg: string) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} connection has been closed`, msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(RedisClusterEvents.END, msg);
        });
        client.on(RedisClusterEvents.ERROR, (msg: string) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} cluster error`, msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(BaseClusterEvents.ERROR, msg);
            if (isSubscriber) this.connectionData.subscriberHadToReconnect = true;
        });
        client.on(RedisClusterEvents.RECONNECTING, (msg: string) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} is attempting to reconnect to the server`, msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(RedisClusterEvents.RECONNECTING, msg);
        });
        client.on("message", this.handlePublishMessage);

    }

    async connectOrThrow(): Promise<true> {
        this.clusterConfig.pinoLogger?.debug(`Connecting to redis server`);

        try {
            await this.client.connect();
        } catch (err) {
            const errMsg = `Client failed to connect to redis cluster - ${err}`;
            this.clusterConfig.pinoLogger?.error(errMsg);
            throw new Error(errMsg);
        }

        try {
            await this.subscriber.connect();
        } catch (err) {
            const errMsg = `Subscriber failed to connect to redis cluster - ${err}`;
            this.clusterConfig.pinoLogger?.error(errMsg);
            throw new Error(errMsg);
        }

        return true;
    }

    private setIsConnected(isSubscriber: boolean, connected: boolean) {
        if (isSubscriber) {
            this.connectionData.subscriberConnected = connected;
        } else {
            this.connectionData.clientConnected = connected;
        }

        // Check if the subscriber had to reconnect at some point and both client & subscriber are now fully connected
        if (this.connectionData.subscriberHadToReconnect && this.connectionData.clientConnected && this.connectionData.subscriberConnected) {
            this.emitEvent(BaseClusterEvents.SUBSCRIBER_RECONNECTED, Date.now()/1000);
            this.connectionData.subscriberHadToReconnect = false;
        }
    }

    override isConnected(isSubscriber: boolean): boolean {
        return (isSubscriber) ? this.connectionData.subscriberConnected : this.connectionData.clientConnected;
    }

    async disconnect(): Promise<boolean> {
        this.clusterConfig.pinoLogger?.debug(`Disconnecting from redis server`);

        try {
            await this.client.disconnect();
        } catch (err) {
            this.clusterConfig.pinoLogger?.error(`Failed to disconnect from redis cluster - ${err}`);
            return false;
        }

        try {
            await this.subscriber.disconnect();
        } catch (err) {
            this.clusterConfig.pinoLogger?.error(`Failed to disconnect from redis cluster - ${err}`);
            return false;
        }

        return true;
    }

    private channel(channel: string) {
        return `${this.clusterConfig.prefix}${channel}`;
    }

    private handlePublishMessage = (channelName: string, message: string): void => {
        // Broadcast the message
        this.subscriptionListeners.emit(`${this.SUB_EVENT_PREFIX}${channelName}`, message);
    }

    async handleSubscribe(channel: string, listener: Listener): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        try {
            // Subscribe if not subscribed already
            if (this.subscriptionListeners.listenerCount(`${this.SUB_EVENT_PREFIX}${channelName}`) === 0) {
                this.clusterConfig.pinoLogger?.debug(`Subscribing to ${channelName}`);
                await this.subscriber.subscribe(channelName);
            }

            // Store original listener
            this.subscriptionListeners.addListener(`${this.SUB_EVENT_PREFIX}${channelName}`, listener);

            return true;
        } catch (e) {
            this.clusterConfig.pinoLogger?.debug(`Failed to subscribe to ${channelName}`, e);
            return false;
        }
    }

    async handleUnsubscribe(channel: string, listener: Listener): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        try {

            // Remove listener from store
            this.subscriptionListeners.removeListener(`${this.SUB_EVENT_PREFIX}${channelName}`, listener);


            // Unsubscribe if no more listeners
            if (this.subscriptionListeners.listenerCount(`${this.SUB_EVENT_PREFIX}${channelName}`) === 0) {
                this.clusterConfig.pinoLogger?.debug(`Unsubscribing from ${channelName}`);
                await this.subscriber.unsubscribe(channelName);
            }

            return true;
        } catch (e) {
            this.clusterConfig.pinoLogger?.debug(`Failed to unsubscribe from ${channelName}`, e);
            return false;
        }
    }

    protected async handlePublish(channel: string, message: string): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        try {
            this.clusterConfig.pinoLogger?.debug(`Publishing message to ${channelName}`);
            await this.client.publish(channelName, message);
            return true;
        } catch (e) {
            this.clusterConfig.pinoLogger?.debug(`Failed to publish message to ${channelName}`, e);
            return false;
        }
    }

    async get(key: string): Promise<string | null> {
        this.clusterConfig.pinoLogger?.debug(`Getting value of key ${this.clusterConfig.prefix}${key}`);
        return this.client.get(key);
    }

    async store(key: string, value: string | number | Buffer, ttl: number | null, lockKey?: string): Promise<boolean> {

        this.clusterConfig.pinoLogger?.debug(`Setting value of key ${this.clusterConfig.prefix}${key}`);

        // Note: Typescript cannot properly infer the arguments due to the ridiculous overloading ioredis does, so we must specify each call individually...
        let promise;
        if (lockKey) {
            promise = (ttl) ?
                this.client.setIfLocked(lockKey, key, this.uniqueClientId, value, "EX", ttl) :
                this.client.setIfLocked(lockKey, key, this.uniqueClientId, value);
        } else {
            promise = (ttl) ?
                this.client.set(key, value, "EX", ttl) :
                this.client.set(key, value);
        }

        return (await promise !== null);
    }

    async remove(key: string, lockKey?: string): Promise<boolean> {
        this.clusterConfig.pinoLogger?.debug(`Deleting value of key ${this.clusterConfig.prefix}${key}`);
        const promise = (lockKey) ?
            this.client.delIfLocked(2, lockKey, key, this.uniqueClientId) :
            this.client.del(key);
        return (await promise !== null);
    }

    async lock(lockOptions: LockOptions): Promise<boolean> {
        /**
         * Be warned: This lock implementation does not guarantee safety and liveness in
         * distributed cluster systems. Read more: https://redis.io/docs/manual/patterns/distributed-locks/
         */

        this.clusterConfig.pinoLogger?.debug(`Attempting to obtain a lock with key ${lockOptions.key}`);

        // Set a key with our unique id IFF the key does not exist already
        const result = await this.client.set(lockOptions.key, this.uniqueClientId, "EX", lockOptions.ttl, "NX");

        return (result !== null);
    }

    async unlock(lockOptions: LockOptions): Promise<boolean> {
        const result = await this.remove(lockOptions.key, lockOptions.key);

        return (result !== null);
    }
}