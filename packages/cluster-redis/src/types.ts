import type {ClusterConfig} from "@dapperduckling/keycloak-connector-server";
import type {ClusterNode, ClusterOptions, RedisOptions} from "ioredis";
import Redis, {Cluster} from "ioredis";

interface Credentials {
    username: string,
    password: string,
}

export interface BaseRedisConfig extends ClusterConfig {
    credentialProvider?: () => Promise<Credentials | undefined>,
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
