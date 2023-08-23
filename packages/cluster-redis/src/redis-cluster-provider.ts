import type {ClusterConfig, Listener, LockOptions} from "keycloak-connector-server";
import {AbstractClusterProvider, BaseClusterEvents} from "keycloak-connector-server";
import {webcrypto} from "crypto";
import * as fs from "fs";
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import Redis, {Cluster, ClusterNode} from "ioredis";
import type {CommonRedisOptions, ClusterOptions, RedisOptions} from "ioredis";
import type {ConnectionOptions} from "tls";
import {is} from "typia";
import type {
    ClusterMode,
    DelIfLocked,
    NonClusterMode, RedisClient,
    RedisClusterConfig,
    SetIfLockedArgs
} from "./types.js";
import {RedisClusterEvents} from "./types.js";

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

        // Create a new redis client
        this.client = this.clusterConfig.clusterMode ?
            new Redis.Cluster([...this.clusterConfig.hostOptions ?? []], this.clusterConfig.clusterOptions) :
            new Redis(this.clusterConfig.redisOptions ?? {});

        // this.client = (config.clusterMode) ? new Redis.Cluster([
        //         {
        //             host: "clustercfg.myCluster.abcdefg.xyz.cache.amazonaws.com",
        //             port: 6379,
        //         },
        //     ],
        //     {
        //         // Required for AWS ElastiCache Clusters with TLS.
        //         // See: https://github.com/redis/ioredis/tree/main#special-note-aws-elasticache-clusters-with-tls
        //         dnsLookup: (address, callback) => callback(null, address),
        //         redisOptions: {
        //             // port: 6379, // Redis port
        //             // host: "127.0.0.1", // Redis host
        //             username: process.env["CLUSTER_REDIS_USERNAME"] ?? "",
        //             password: process.env["CLUSTER_REDIS_PASSWORD"] ?? "",
        //             connectionName: process.env["CLUSTER_REDIS_CLIENT_NAME"] ?? `keycloak-connector-${this.uniqueClientId}-client`,
        //             reconnectOnError: (err) => {
        //                 // Reconnect on READONLY state to handle AWS ElastiCache primary replica changes
        //                 const targetError = "READONLY";
        //                 return err.message.includes(targetError);
        //             },
        //             connectTimeout: 60, // An initial connection should not take more than one minute
        //             tls: {},
        //         },
        //     }) : new Redis({
        //     port: 6379, // Redis port
        //     host: "127.0.0.1", // Redis host
        //     username: process.env["CLUSTER_REDIS_USERNAME"] ?? "",
        //     password: process.env["CLUSTER_REDIS_PASSWORD"] ?? "",
        //     tls: {},
        //     connectionName: process.env["CLUSTER_REDIS_CLIENT_NAME"] ?? `keycloak-connector-${this.uniqueClientId}`,
        //     reconnectOnError: (err) => {
        //         // Reconnect on READONLY state to handle AWS ElastiCache primary replica changes
        //         const targetError = "READONLY";
        //         return err.message.includes(targetError);
        //     },
        //     connectTimeout: 60, // An initial connection should not take more than one minute
        // });

        // Register custom commands
        this.registerCustomCommands();

        // Create the pub-sub client
        const overrideOptions = {
            connectionName: `keycloak-connector-${this.uniqueClientId}-subscriber`
        }
        this.subscriber = this.isClientClusterMode(this.client) ? this.client.duplicate([], overrideOptions) : this.client.duplicate(overrideOptions);

        // Register event listeners
        this.registerEventListeners(this.client);
        this.registerEventListeners(this.subscriber, true);

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


    private registerCustomCommands() {
        // Get lua script directory
        const scriptDir = dirname(fileURLToPath(import.meta.url)) + '/lua-scripts/';

        // Register setIfLocked
        this.client.defineCommand("setIfLocked", {
            numberOfKeys: 2,
            lua: fs.readFileSync(`${scriptDir}/set-if-locked.lua`, 'utf8'),
        });

        // Set setIfLocked argument transformer
        Redis.Command.setArgumentTransformer("setIfLocked", (args: any[]) => {
            // Ensure the arguments are correct
            if (!is<SetIfLockedArgs>(args)) {
                this.clusterConfig.pinoLogger?.error(`Input args for "setIfLocked" not as expected, cannot execute command.`);
            }

            // Grab the individual args
            const [lockKey, lockValue, key, value] = args as SetIfLockedArgs;

            // Return the re-organized arguments
            return [lockKey, key, lockValue, value];
        });

        // Register deleteIfLocked
        this.client.defineCommand("deleteIfLocked", {
            lua: fs.readFileSync(`${scriptDir}/del-if-locked.lua`, 'utf8'),
        });

        // Set deleteIfLocked argument transformer
        Redis.Command.setArgumentTransformer("deleteIfLocked", (args: any[]) => {
            // Ensure the arguments are correct
            if (!is<DelIfLocked>(args)) {
                this.clusterConfig.pinoLogger?.error(`Input args for "delIfLocked" not as expected, cannot execute command.`);
            }

            // Grab the individual args
            const [lockKey, lockValue, keys] = args as DelIfLocked;

            // Return the re-organized arguments (with dynamic number of keys)
            return [keys.length + 1, lockKey, ...keys, lockValue];
        });
    }

    private generateDefaults(config: RedisClusterConfig) {

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
            ...config.redisOptions,
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

        // Grab any environment variable prefix
        if (process.env["CLUSTER_REDIS_PREFIX"]) this.clusterConfig.prefix ??= process.env["CLUSTER_REDIS_PREFIX"];

        // Check for a prefix
        if (this.clusterConfig.prefix !== undefined || process.env["CLUSTER_REDIS_NO_PREFIX"]?.toLowerCase() === "true") return;

        // No prefix, show a warning
        this.clusterConfig.pinoLogger?.warn("***CHECK CONFIGURATION*** It is highly recommended to set a prefix when using Redis in order to allow for easier permission management configuration.");

    }

    private registerEventListeners(client: RedisClient, isSubscriber: boolean = false) {

        const clientNameTag = (isSubscriber) ? "Subscriber" : "Client";

        // Register the event listeners
        client.on(RedisClusterEvents.READY, (msg) => {
            this.clusterConfig.pinoLogger?.debug(`Redis ${clientNameTag} ready to use`, msg);
            this.setIsConnected(isSubscriber, true);
            this.emitEvent(RedisClusterEvents.READY, msg);
        });
        client.on(RedisClusterEvents.END, (msg) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} connection has been closed`, msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(RedisClusterEvents.END, msg);
        });
        client.on(RedisClusterEvents.ERROR, (msg) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} cluster error`, msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(BaseClusterEvents.ERROR, msg);
            this.reconnectData.hadToReconnect = true;
        });
        client.on(RedisClusterEvents.RECONNECTING, (msg) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} is attempting to reconnect to the server`, msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(RedisClusterEvents.RECONNECTING, msg);
            // this.reconnectData.lastReconnectingMessageTimestamp = Date.now() / 1000;
        });

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
            return true;
        } catch (err) {
            this.clusterConfig.pinoLogger?.error(`Failed to disconnect from redis cluster - ${err}`);
            return false;
        }
    }

    private channel(channel: string) {
        const prefix = (typeof this.clusterConfig.prefix === "string") ? this.clusterConfig.prefix : this.clusterConfig.prefix?.channel ?? "";
        return `${prefix}${channel}`;
    }

    private key(key: string) {
        const prefix = (typeof this.clusterConfig.prefix === "string") ? this.clusterConfig.prefix : this.clusterConfig.prefix?.key ?? "";
        return `${prefix}${key}`;
    }

    async handleSubscribe(channel: string, listener: Listener): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        this.clusterConfig.pinoLogger?.debug(`Subscribing to ${channelName}`);

        if (this.isClusterMode()) {
            // Cluster-mode
            await this.subscriber.sSubscribe(channelName, listener);
        } else {
            // Non cluster-mode
            await this.subscriber.subscribe(channelName, listener);
        }

        //todo: will this return null??
        return true;
    }

    async handleUnsubscribe(channel: string, listener: Listener): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        this.clusterConfig.pinoLogger?.debug(`Unsubscribing from ${channelName}`);

        if (this.isClusterMode()) {
            // Cluster-mode
            await this.subscriber.sUnsubscribe(channelName, listener);
        } else {
            await this.subscriber.unsubscribe(channelName, listener);
        }

        //todo: will this return null??
        return true;
    }

    protected async handlePublish(channel: string, message: string): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        this.clusterConfig.pinoLogger?.debug(`Publishing message to ${channelName}`);

        if (this.isClusterMode()) {
            await this.client.sPublish(channelName, message);
        } else {
            await this.client.publish(channelName, message);
        }

        //todo: will this return null??
        return true;
    }

    async get(key: string): Promise<string | null> {
        const keyName = this.key(key);
        this.clusterConfig.pinoLogger?.debug(`Getting value of key ${keyName}`);
        return await this.client.get(keyName);
    }

    async store(key: string, value: string | number | Buffer, ttl: number | null, lockKey?: string): Promise<boolean> {

        const keyName = this.key(key);
        this.clusterConfig.pinoLogger?.debug(`Setting value of key ${keyName}`);

        const baseArgs = [keyName, value] as const;
        const args = (ttl === null) ? baseArgs : [...baseArgs, {EX: ttl}] as const;

        // Check if we are only setting with a lock
        let result;
        if (lockKey) {
            result = await this.client.setIfLocked(this.key(lockKey), this.uniqueClientId, ...args);
        } else {
            result = await this.client.set(...args);
        }

        return (result !== null);
    }

    async remove(key: string, lockKey?: string): Promise<boolean> {
        const keyName = this.key(key);
        this.clusterConfig.pinoLogger?.debug(`Deleting value of key ${keyName}`);
        const result = (lockKey) ? this.client.deleteIfLocked(this.key(lockKey), this.uniqueClientId, keyName) : this.client.del(keyName);
        return (await result !== null);
    }

    async lock(lockOptions: LockOptions): Promise<boolean> {
        /**
         * Be warned: This lock implementation does not guarantee safety and liveness in
         * distributed cluster systems. Read more: https://redis.io/docs/manual/patterns/distributed-locks/
         */

        // Grab the fully prefixed key
        const keyName = this.key(lockOptions.key);

        this.clusterConfig.pinoLogger?.debug(`Attempting to obtain a lock with key ${keyName}`);

        // Set a key with our unique id IFF the key does not exist already
        const result = await this.client.set(keyName, this.uniqueClientId, {
            EX: lockOptions.ttl,
            NX: true,
        });

        return (result !== null);
    }

    async unlock(lockOptions: LockOptions): Promise<boolean> {
        const result = await this.remove(lockOptions.key, lockOptions.key);

        return (result !== null);
    }
}