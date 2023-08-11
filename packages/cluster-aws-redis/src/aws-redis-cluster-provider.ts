import type {ClusterConfig, listener} from "keycloak-connector-server";
import {AbstractClusterProvider, BaseClusterEvents,} from "keycloak-connector-server";
import {createClient, createCluster} from "redis";
import type {RedisClientOptions} from "redis";
import type {RedisClusterOptions} from "@redis/client";
import type {RedisSocketOptions} from "@redis/client/dist/lib/client/socket.js";

interface BaseRedisClusterConfig extends ClusterConfig {
    prefix: string | {
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

type RedisClient = ReturnType<typeof createCluster> | ReturnType<typeof createClient>;

export class AwsRedisClusterProvider extends AbstractClusterProvider<RedisClusterEvents> {

    protected override clusterConfig: RedisClusterConfig;
    private readonly client: RedisClient;
    private isClientConnected: boolean = false;
    private readonly subscriber: RedisClient;
    private isSubscriberConnected: boolean = false;

    constructor(clusterConfig: RedisClusterConfig) {
        super(clusterConfig);

        // Handle each cluster mode config differently
        this.clusterConfig = this.isConfigClusterMode(clusterConfig) ? this.handleClusterMode(clusterConfig) : this.handleNonClusterMode(clusterConfig);

        // Ensure connections are happening over TLS
        this.ensureTlsConfig();

        // Create a new redis client
        this.client = (clusterConfig.clusterMode) ?
            createCluster(clusterConfig.redisConfig as RedisClusterOptions) : createClient(clusterConfig.redisConfig as RedisClientOptions);

        // Create the pub sub client
        this.subscriber = this.client.duplicate();

        // Register event listeners
        this.registerEventListeners(this.client);
        this.registerEventListeners(this.subscriber);

        //todo: Test cluster mode
        // Add cluster mode warning
        this.clusterConfig.pinoLogger?.warn("**WARNING** Using Redis in cluster mode has not been thoroughly tested.");
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
                if (this.clusterConfig.DANGEROUS_allowUnsecureConnectionToRedisServer !== true || process.env["CLUSTER_REDIS_DANGEROUSLY_DISABLE_TLS"]?.toLowerCase() !== "true") {
                    throw new Error(`Connection url does not not start with "rediss" disabling TLS connection to REDIS server. Will not connect via unsecure connection without override.`);
                }

                this.clusterConfig.pinoLogger?.warn("***DANGEROUS CONFIGURATION*** Connecting to REDIS server using unsecure connection!");
            }
        }
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
        });
        client.on(RedisClusterEvents.RECONNECTING, (msg) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} is attempting to reconnect to the server`, msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(RedisClusterEvents.RECONNECTING, msg);
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
        const prefix = (typeof this.clusterConfig.prefix === "string") ? this.clusterConfig.prefix : this.clusterConfig.prefix.channel;
        return `${prefix}${channel}`;
    }

    private key(key: string) {
        const prefix = (typeof this.clusterConfig.prefix === "string") ? this.clusterConfig.prefix : this.clusterConfig.prefix.key;
        return `${prefix}${key}`;
    }

    async subscribe(channel: string, listener: listener): Promise<boolean> {
        // Grab the correct function
        const targetFunc = (this.isClusterMode()) ? this.subscriber.sSubscribe : this.subscriber.subscribe;

        // Execute the request
        await targetFunc(this.channel(channel), listener);

        return true;
    }

    async unsubscribe(channel: string, listener: listener): Promise<boolean> {
        // Grab the correct function
        const targetFunc = (this.isClusterMode()) ? this.subscriber.sUnsubscribe : this.subscriber.unsubscribe;

        // Execute the request
        const channelName = this.channel(channel);
        await targetFunc(channelName, listener);

        return true;
    }

    async publish(channel: string, message: string | Buffer): Promise<boolean> {
        // Grab the correct function
        const targetFunc = (this.isClusterMode()) ? this.subscriber.sPublish : this.subscriber.publish;

        // Execute the request
        await targetFunc(this.channel(channel), message);

        return true;
    }

    async get(key: string): Promise<boolean> {
        const keyName = this.key(key);
        await this.client.get(keyName);

        return true;
    }

    async store(key: string, value: string | number | Buffer, ttl: number | null): Promise<boolean> {

        const keyName = this.key(key);
        await ((ttl === null) ? this.client.set(keyName, value) : this.client.set(keyName, value, {
            EX: ttl
        }));

        return true;
    }

    async remove(key: string): Promise<boolean> {
        const keyName = this.key(key);
        await this.client.del(keyName);
        return true;
    }
}