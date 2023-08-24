import type RedisCommander from "ioredis/built/utils/RedisCommander.js";
import type {ClusterConfig} from "keycloak-connector-server";
import type {ClusterNode, ClusterOptions, RedisOptions} from "ioredis";
import Redis, {Cluster} from "ioredis";

export interface BaseRedisConfig extends ClusterConfig {
    hostOptions?: [ClusterNode, ...ClusterNode[]],
    redisOptions?: RedisOptions,
    prefix?: string,
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