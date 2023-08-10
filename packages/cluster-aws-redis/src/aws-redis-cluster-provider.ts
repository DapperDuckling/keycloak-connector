import type {ClusterConfig} from "keycloak-connector-server";
import {AbstractClusterProvider, BaseClusterEvents,} from "keycloak-connector-server";
import {createCluster} from "redis";
import type {RedisClusterOptions} from "@redis/client";


interface AwsRedisClusterConfig extends ClusterConfig  {
    redisConfig?: RedisClusterOptions,
    // redisConfig: RedisClientOptions,
    prefix: string | {
        object: string,
        pubsub: string,
    };
    DANGEROUS_allowUnsecureConnectionToRedisServer?: boolean;
}

export enum RedisClusterEvents {
    CONNECT = "connect",
    READY = "ready",
    END = "end",
    ERROR = "error",
    RECONNECTING = "reconnecting",
}

export class AwsRedisClusterProvider extends AbstractClusterProvider<RedisClusterEvents> {

    protected override clusterConfig: AwsRedisClusterConfig;
    private client: ReturnType<typeof createCluster>;
    private isConnectedTracker: boolean = false;

    constructor(clusterConfig: AwsRedisClusterConfig) {
        super(clusterConfig);

        // Store the cluster config
        this.clusterConfig = clusterConfig;

        // Create a bogus config if not already specified
        this.clusterConfig.redisConfig ??= {
            rootNodes: []
        };

        // Set the defaults
        this.clusterConfig.redisConfig = {
            ...this.clusterConfig.redisConfig,

            // Add a default node if none are specified
            ...(this.clusterConfig.redisConfig.rootNodes.length === 0 && process.env["REDIS_URL"]) && {
                rootNodes: [{
                    url: process.env["REDIS_URL"]
                }]
            },

            // Add default connection information
            defaults: {
                ...process.env["REDIS_USERNAME"] && {username: process.env["REDIS_USERNAME"]},
                ...process.env["REDIS_PASSWORD"] && {password: process.env["REDIS_PASSWORD"]},
                name: process.env["REDIS_CLIENT_NAME"] ?? "keycloak-connector",
                ...this.clusterConfig.redisConfig.defaults,
            },
        }

        // Grab a reference to the redis configuration
        const redisConfig = this.clusterConfig.redisConfig;

        // Ensure the connections are over TLS
        for (const node of this.clusterConfig.redisConfig.rootNodes) {
            // Check for secure connection
            if (
                (node.url && node.url.startsWith("rediss")) ||
                (node.socket && node.socket.tls === true)
            ) continue;

            // Check for missing dangerous override flag
            if (this.clusterConfig.DANGEROUS_allowUnsecureConnectionToRedisServer !== true) {
                throw new Error(`Connection url does not not start with "rediss" disabling TLS connection to REDIS server. Will not connect via unsecure connection without override.`);
            }

            this.clusterConfig.pinoLogger?.warn("***DANGEROUS CONFIGURATION*** Connecting to REDIS server using unsecure connection!");
        }

        // Create a new redis client
        this.client = createCluster(redisConfig);

        // Register the error listeners
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



}