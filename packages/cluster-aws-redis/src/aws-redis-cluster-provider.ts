import {
    AbstractClusterProvider,
} from "keycloak-connector-server";
import type {ClusterConfig} from "keycloak-connector-server";
import {createClient} from "redis";
import type {RedisClientOptions} from "@redis/client";

type AwsRedisPasswordAuthentication = {
    username: string;
    password: string;
}

type AwsRedisIamAuthentication = {
    whoknowswhatineed: string;
}

interface AwsRedisClusterConfig extends ClusterConfig  {
    redisConfig: RedisClientOptions,
    // credentials: AwsRedisPasswordAuthentication | AwsRedisIamAuthentication;
    prefix: string | {
        object: string,
        pubsub: string,
    };
    DANGEROUS_allowUnsecureConnectionToRedisServer?: boolean;
    // endpoint: string;
}

export enum AwsRedisClusterEvents {
    "AWS_RANDOM_EVENT" = "AWS_RANDOM_EVENT",
    "AWS_EVENT_2" = "AWS_EVENT_2",
}


export class AwsRedisClusterProvider extends AbstractClusterProvider<AwsRedisClusterEvents> {

    protected override clusterConfig: AwsRedisClusterConfig;
    private client: ReturnType<typeof createClient>;

    constructor(clusterConfig: AwsRedisClusterConfig) {
        super(clusterConfig);

        // Store the cluster config
        this.clusterConfig = clusterConfig;

        // Ensure the connection is over TLS
        if (
            (this.clusterConfig.redisConfig.url && this.clusterConfig.redisConfig.url.startsWith("rediss")) ||
            (this.clusterConfig.redisConfig.socket && this.clusterConfig.redisConfig.socket.tls !== true)
        ) {

            // Check for no dangerous override flag
            if (this.clusterConfig.DANGEROUS_allowUnsecureConnectionToRedisServer !== true) {
                throw new Error(`Connection url does not not start with "rediss" disabling TLS connection to REDIS server. Will not connect via unsecure connection without override.`);
            }

            this.clusterConfig.pinoLogger?.warn("***DANGEROUS CONFIGURATION*** Connecting to REDIS server using unsecure connection!");
        }

        // Create a new redis client
        this.client = createClient(this.clusterConfig.redisConfig);
    }

    connect(args: any): boolean {


        return false;
    }

    disconnect(args: any): boolean {
        return false;
    }



}