import type {ClusterConfig, Listener, LockOptions} from "keycloak-connector-server";
import {AbstractClusterProvider, BaseClusterEvents} from "keycloak-connector-server";
import type {RedisClientOptions, RedisFunctions, RedisModules} from "redis";
import {createClient, createCluster, defineScript} from "redis";
import type {RedisClusterOptions} from "@redis/client";
import type {RedisSocketOptions} from "@redis/client/dist/lib/client/socket.js";
import {webcrypto} from "crypto";
import type {RedisCommandArguments, RedisScript} from "@redis/client/dist/lib/commands/index.js";
import {transformArguments as transformArgumentsForSET} from "@redis/client/dist/lib/commands/SET.js";
import * as fs from "fs";
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {sleep} from "keycloak-connector-server/dist/helpers/utils.js";

interface BaseRedisClusterConfig extends ClusterConfig {
    prefix?: string | {
        key: string,
        channel: string,
    };
    DANGEROUS_allowUnsecureConnectionToRedisServer?: boolean;
}

type ClusterMode = BaseRedisClusterConfig & {
    redisConfig?: RedisClusterOptions,
    clusterMode: true,
};

type NonClusterMode = BaseRedisClusterConfig & {
    redisConfig?: RedisClientOptions,
    clusterMode?: false,
}

export type RedisClusterConfig = ClusterMode | NonClusterMode;

export enum RedisClusterEvents {
    CONNECT = "connect",
    READY = "ready",
    END = "end",
    ERROR = "error",
    RECONNECTING = "reconnecting",
}

type RedisClient = ReturnType<typeof createCluster<RedisModules, RedisFunctions, RedisClusterScripts>> | ReturnType<typeof createClient<RedisModules, RedisFunctions, RedisClusterScripts>>;



interface RedisClusterScripts {
    setIfLocked: RedisScript & {
        transformArguments(lockKey: string, lockValue: string, ...args: Parameters<typeof transformArgumentsForSET>): RedisCommandArguments;
    },
    deleteIfLocked: RedisScript & {
        transformArguments(lockKey: string, lockValue: string, key: string): RedisCommandArguments;
    },
    [script: string]: RedisScript,
}

export class RedisClusterProvider extends AbstractClusterProvider<RedisClusterEvents> {

    protected override clusterConfig: RedisClusterConfig;
    private readonly client: RedisClient;
    private isClientConnected: boolean = false;
    private readonly subscriber: RedisClient;
    private isSubscriberConnected: boolean = false;
    private readonly uniqueClientId: string;
    private reconnectData = {
        hadToReconnect: false,
        lastReconnectingMessageTimestamp: -1,
        corkReconnects: false,
    }

    constructor(clusterConfig?: RedisClusterConfig) {
        clusterConfig ??= {};
        super(clusterConfig);

        // Generate a unique id for this client
        this.uniqueClientId = `${Date.now()}-${webcrypto.randomUUID()}`;

        // Handle each cluster mode config differently
        this.clusterConfig = this.isConfigClusterMode(clusterConfig) ? this.handleClusterMode(clusterConfig) : this.handleNonClusterMode(clusterConfig);

        // Ensure connections are happening over TLS
        this.ensureTlsConfig();

        // Ensure there is a prefix
        this.ensurePrefix();

        // Get lua script directory
        const scriptDir = dirname(fileURLToPath(import.meta.url)) + '/lua-scripts/';

        // Build the custom scripts
        const clusterScripts: RedisClusterScripts = {
            setIfLocked: defineScript({
                NUMBER_OF_KEYS: 2,
                SCRIPT: fs.readFileSync(`${scriptDir}/set-if-locked.lua`, 'utf8'),
                transformArguments(lockKey: string, lockValue: string, ...args: Parameters<typeof transformArgumentsForSET>) {
                    const value = (typeof args[1] === "number") ? args[1].toString() : args[1];
                    const baseArgs = [lockKey, args[0], lockValue, value];
                    if (args[2]) baseArgs.push(JSON.stringify(args[2]));
                    return baseArgs;
                }
            }),
            deleteIfLocked: defineScript({
                NUMBER_OF_KEYS: 2,
                SCRIPT: fs.readFileSync(`${scriptDir}/del-if-locked.lua`, 'utf8'),
                transformArguments(lockKey: string, lockValue: string, key: string) {
                    return [lockKey, key, lockValue];
                }
            })
        }

        // Add custom scripts
        clusterConfig.redisConfig ??= {};
        clusterConfig.redisConfig.scripts = {
            ...clusterConfig.redisConfig.scripts,
            ...clusterScripts,
        }

        // Create a new redis client
        // Note -- Much less code to just cast to RedisClient
        this.client = (clusterConfig.clusterMode) ?
            createCluster(clusterConfig.redisConfig as RedisClusterOptions) as unknown as RedisClient : createClient(clusterConfig.redisConfig as RedisClientOptions) as unknown as RedisClient;

        // Create the pub sub client
        this.subscriber = this.client.duplicate();

        // Register event listeners
        this.registerEventListeners(this.client);
        this.registerEventListeners(this.subscriber, true);

        // Setup the reconnect watchdog
        setImmediate(() => this.reconnectWatchDog());

        // Add cluster mode warning
        //todo: Test cluster mode
        if (clusterConfig.clusterMode) this.clusterConfig.pinoLogger?.warn("**WARNING** Using Redis in cluster mode has not been thoroughly tested.");
    }

    private async reconnectWatchDog() {
        try {
            console.log(`WATCH DOG CHECKING!`);

            // Check if we had to reconnect
            if (!this.reconnectData.hadToReconnect) return;

            // Check the last reconnecting message was recent
            const maxReconnectMessageAge = 15;
            if (this.reconnectData.lastReconnectingMessageTimestamp < Date.now()/1000 - maxReconnectMessageAge) {
                this.clusterConfig.pinoLogger?.warn(`Reconnect watchdog has seen no reconnect messages in the last ${maxReconnectMessageAge} seconds!`);
                try {
                    // Disconnect
                    this.clusterConfig.pinoLogger?.warn(`Disconnecting client and subscriber`);
                    await this.client.disconnect();
                    await this.subscriber.disconnect();
                } catch (e) {}

                // Sleep for a bit
                await sleep(15000);

                try {
                    // Reconnect
                    this.clusterConfig.pinoLogger?.warn(`Attempting to reconnect client and subscriber`);
                    await this.connectOrThrow();
                    this.clusterConfig.pinoLogger?.warn(`Successfully reconnected client and subscriber`);
                    this.reconnectData.hadToReconnect = false;
                }  catch (e)  {
                    this.clusterConfig.pinoLogger?.warn(`Failed to reconnect client and subscriber`);
                    this.reconnectData.lastReconnectingMessageTimestamp = Date.now()/1000;
                }
            }
        } finally {
            setTimeout(async () => this.reconnectWatchDog(), 10000);
        }
    }

    private handleClusterMode(config: ClusterMode): ClusterMode {
        // Create a bogus config if not already specified
        config.redisConfig ??= {
            rootNodes: []
        };

        // Generate defaults
        const defaults = this.generateDefaults();

        // Set the defaults
        config.redisConfig = {
            ...config.redisConfig,

            // Add a default node if none are specified
            ...(config.redisConfig.rootNodes.length === 0 && process.env["CLUSTER_REDIS_URL"]) && {
                rootNodes: [{
                    socket: defaults['socket']
                }]
            },

            // Add default connection information
            defaults: {
                ...defaults['authentication'],
                ...config.redisConfig.defaults,
            },
        }

        return config;
    }

    private handleNonClusterMode(config: NonClusterMode): NonClusterMode {
        // Create a bogus config if not already specified
        config.redisConfig ??= {};

        const defaults = this.generateDefaults();

        // Set the defaults
        config.redisConfig = {
            ...defaults['authentication'],
            socket: defaults['socket'],
            ...config.redisConfig
        }

        return config;
    }

    private generateDefaults() {

        const socket: RedisSocketOptions = {
            reconnectStrategy: (retries: number) => {
                //todo: test this new code
                return false; //todo: remove

                // // Reset corkReconnects
                // if (retries === 0) this.reconnectData.corkReconnects = false;
                //
                // // Check if we should reconnect
                // if (this.reconnectData.corkReconnects) return false;
                //
                // this.clusterConfig.pinoLogger?.debug(`Attempting to reconnect, ${retries} attempt`);
                // return Math.min(retries * 50, 500);
            },
            tls: !(process.env["CLUSTER_REDIS_DANGEROUSLY_DISABLE_TLS"]?.toLowerCase() === "true"),
            ...process.env["CLUSTER_REDIS_HOST"] && {host: process.env["CLUSTER_REDIS_HOST"]},
            ...process.env["CLUSTER_REDIS_PORT"] && {port: +process.env["CLUSTER_REDIS_PORT"]},
            ...process.env["CLUSTER_REDIS_TLS_SNI"] && {servername: process.env["CLUSTER_REDIS_TLS_SNI"]},
        }

        return {
            socket: socket,
            authentication: {
                ...process.env["CLUSTER_REDIS_USERNAME"] && {username: process.env["CLUSTER_REDIS_USERNAME"]},
                ...process.env["CLUSTER_REDIS_PASSWORD"] && {password: process.env["CLUSTER_REDIS_PASSWORD"]},
                name: process.env["CLUSTER_REDIS_CLIENT_NAME"] ?? "keycloak-connector",
            }
        }
    }

    private ensureTlsConfig() {
        const nodes = (this.isConfigClusterMode(this.clusterConfig)) ? this.clusterConfig.redisConfig?.rootNodes ?? [] : [this.clusterConfig.redisConfig];

        // Ensure the connections are over TLS
        for (const node of nodes) {
            // Skip any undefined
            if (node === undefined) continue;

            // Ensure the connection is over TLS
            if (
                (node.url && node.url.startsWith("rediss")) ||
                (node.socket && node.socket.tls !== true)
            ) {

                // Check for no dangerous override flag
                if (this.clusterConfig.DANGEROUS_allowUnsecureConnectionToRedisServer !== true && process.env["CLUSTER_REDIS_DANGEROUSLY_DISABLE_TLS"]?.toLowerCase() !== "true") {
                    throw new Error(`Connection url does not not start with "rediss" disabling TLS connection to REDIS server. Will not connect via unsecure connection without override.`);
                }

                this.clusterConfig.pinoLogger?.warn("***DANGEROUS CONFIGURATION*** Connecting to REDIS server using unsecure connection!");
            }
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
            this.reconnectData.lastReconnectingMessageTimestamp = Date.now() / 1000;
        });

    }

    private isClusterMode(): boolean {
        return this.clusterConfig.clusterMode === true;
    }

    private isConfigClusterMode(config: RedisClusterConfig): config is ClusterMode {
        return config.clusterMode ?? false;
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
            this.isSubscriberConnected = connected
        } else {
            this.isClientConnected = connected;
        }

        // Check if we had to reconnect at some point and now we are fully connected
        if (this.reconnectData.hadToReconnect && this.isClientConnected && this.isSubscriberConnected) {
            this.emitEvent(BaseClusterEvents.FULLY_RECONNECTED, Date.now()/1000);
            this.reconnectData.hadToReconnect = false;

            //todo: do we need to resubscribe?
        }
    }

    override isConnected(isSubscriber: boolean): boolean {
        return (isSubscriber) ? this.isSubscriberConnected : this.isClientConnected;
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