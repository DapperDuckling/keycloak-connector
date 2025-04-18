import type {ClusterConfig} from "@dapperduckling/keycloak-connector-server";
import type {ClusterNode, ClusterOptions, RedisOptions} from "ioredis";
import Redis, {Cluster} from "ioredis";

export interface Credentials {
    username?: string,
    password?: string,
}

export interface BaseRedisConfig extends ClusterConfig {
    // See https://github.com/redis/ioredis
    redisOptions?: RedisOptions,

    // For cluster configuration, specify the connection information for each node
    hostOptions?: [ClusterNode, ...ClusterNode[]],

    // Prepends a specific prefix to all operations before sending commands to the
    // redis server
    prefix?: string,

    // For dynamic credentials, a
    credentialProvider?: () => Promise<Credentials | undefined>,
    credentialUpdateIntervalMins?: number,
    DANGEROUS_allowUnsecureConnectionToRedisServer?: boolean,
}

export type ClusterMode = BaseRedisConfig & {
    clusterOptions: ClusterOptions,
    clusterMode: true,
};

export type NonClusterMode = BaseRedisConfig & {
    clusterMode?: false,
}

export type RedisClusterConfig = ClusterMode | NonClusterMode;

export enum RedisClusterEvents {
    WAIT = "wait",
    RECONNECTING = "reconnecting",
    CONNECTING = "connecting",
    CONNECT = "connect",
    READY = "ready",
    CLOSE = "close",
    END = "end",
    ERROR = "error",
}

export type RedisClient = Redis | Cluster;
