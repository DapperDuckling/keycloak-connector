import {
    AbstractClusterProvider,
    BaseClusterEvents,
} from "keycloak-connector-server";

type AwsRedisPasswordAuthentication = {
    username: string;
    password: string;
}

type AwsRedisIamAuthentication = {
    whoknowswhatineed: string;
}

type AwsRedisClusterConfig = {
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

    private clusterConfig: AwsRedisClusterConfig;

    constructor(clusterConfig: AwsRedisClusterConfig) {
        super();

        this.clusterConfig = clusterConfig;

        this.addEventListener("ds");
        this.addEventListener(AwsRedisClusterEvents.AWS_RANDOM_EVENT);
        this.addEventListener(BaseClusterEvents.CONNECTED);
    }
}