import type RedisCommander from "ioredis/built/utils/RedisCommander.js";
import type {ClusterConfig} from "keycloak-connector-server";
import type {ClusterNode, ClusterOptions, RedisOptions} from "ioredis";
import Redis, {Cluster} from "ioredis";

export type SetIfLockedArgs = [lockKey: string, lockValue: string, ...args: Parameters<RedisCommander['set']>];
export type DelIfLocked = [lockKey: string, lockValue: string, ...args: Parameters<RedisCommander['del']>];

export interface BaseRedisConfig extends ClusterConfig {
    hostOptions?: [ClusterNode, ...ClusterNode[]],
    redisOptions?: RedisOptions,
    prefix?: string | {
        key: string,
        channel: string,
    },
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
    CONNECT = "connect",
    READY = "ready",
    END = "end",
    ERROR = "error",
    RECONNECTING = "reconnecting",
}

export type RedisClient = Redis | Cluster;