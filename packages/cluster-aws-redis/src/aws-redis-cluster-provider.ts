import type {ClusterConfig} from "keycloak-connector-server";
import {AbstractClusterProvider, BaseClusterEvents,} from "keycloak-connector-server";
import {createClient, createCluster} from "redis";
import type {RedisClientOptions} from "redis";
import type {RedisClusterOptions} from "@redis/client";
import type {RedisSocketOptions} from "@redis/client/dist/lib/client/socket.js";

interface BaseRedisClusterConfig extends ClusterConfig {
    prefix: string | {
        object: string,
        pubsub: string,
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

export class AwsRedisClusterProvider extends AbstractClusterProvider<RedisClusterEvents> {

    protected override clusterConfig: RedisClusterConfig;
    private client: ReturnType<typeof createCluster> | ReturnType<typeof createClient>;
    private isConnectedTracker: boolean = false;

    constructor(clusterConfig: RedisClusterConfig) {
        super(clusterConfig);

        // Handle each cluster mode config differently
        this.clusterConfig = this.isConfigClusterMode(clusterConfig) ? this.handleClusterMode(clusterConfig) : this.handleNonClusterMode(clusterConfig);

        // Ensure connections are happening over TLS
        this.ensureTlsConfig();

        // Create a new redis client
        this.client = (clusterConfig.clusterMode) ?
            createCluster(clusterConfig.redisConfig as RedisClusterOptions) : createClient(clusterConfig.redisConfig as RedisClientOptions);

        // Register event listeners
        this.registerEventListeners();
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

    private registerEventListeners() {
        // Register the event listeners
        this.client.on(RedisClusterEvents.READY, (msg) => {
            this.clusterConfig.pinoLogger?.debug(`Redis ready to use`, msg);
            this.isConnectedTracker = true;
            this.emitEvent(RedisClusterEvents.READY, msg);
        });
        this.client.on(RedisClusterEvents.END, (msg) => {
            this.clusterConfig.pinoLogger?.error(`Redis connection has been closed`, msg);
            this.isConnectedTracker = false;
            this.emitEvent(RedisClusterEvents.END, msg);
        });
        this.client.on(RedisClusterEvents.ERROR, (msg) => {
            this.clusterConfig.pinoLogger?.error(`Redis cluster error`, msg);
            this.isConnectedTracker = false;
            this.emitEvent(BaseClusterEvents.ERROR, msg);
        });
        this.client.on(RedisClusterEvents.RECONNECTING, (msg) => {
            this.clusterConfig.pinoLogger?.error(`Redis client is attempting to reconnect to the server`, msg);
            this.isConnectedTracker = false;
            this.emitEvent(RedisClusterEvents.RECONNECTING, msg);
        });
    }

    private isConfigClusterMode(config: RedisClusterConfig): config is ClusterMode {
        return config.clusterMode ?? false;
    }

    async connectOrThrow(): Promise<true> {
        this.clusterConfig.pinoLogger?.debug(`Connecting to redis server`);

        try {
            await this.client.connect();
            return true;
        } catch (err) {
            const errMsg = `Failed to connect to redis cluster - ${err}`;
            this.clusterConfig.pinoLogger?.error(errMsg);
            throw new Error(errMsg);
        }
    }

    override isConnected(): boolean {
        return this.isConnectedTracker;
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

    publish(topic: string, args: any): boolean {
        this.client.publish()
    }

    remove(key: string): boolean {
        return false;
    }

    store(key: string, value: any[], ttl: number | undefined): boolean {
        return false;
    }

    subscribe(topic: string): boolean {
        return false;
    }

    unsubscribe(topic: string): boolean {
        return false;
    }
}