import {
    AbstractClusterProvider,
    BaseClusterEvents,
} from "keycloak-connector-server";
import type {ClusterConfig} from "keycloak-connector-server";

type AwsRedisPasswordAuthentication = {
    username: string;
    password: string;
}

type AwsRedisIamAuthentication = {
    whoknowswhatineed: string;
}

interface AwsRedisClusterConfig extends ClusterConfig  {
    credentials: AwsRedisPasswordAuthentication | AwsRedisIamAuthentication;
    prefix: string | {
        object: string,
        pubsub: string,
    };
    endpoint: string;
}

export enum AwsRedisClusterEvents {
    "AWS_RANDOM_EVENT" = "AWS_RANDOM_EVENT",
    "AWS_EVENT_2" = "AWS_EVENT_2",
}


class AwsRedisClusterProvider extends AbstractClusterProvider<AwsRedisClusterEvents> {

    protected override clusterConfig: AwsRedisClusterConfig;

    constructor(clusterConfig: AwsRedisClusterConfig) {
        super(clusterConfig);

        // Store the cluster config
        this.clusterConfig = clusterConfig;

    }
}