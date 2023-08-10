import {AbstractClusterProvider, AllClusterEvents, BaseClusterEvents} from "keycloak-connector-server";

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

// type AwsRedisClusterEventsAll = AwsRedisClusterEvents & BaseClusterEvents;
// type AwsRedisClusterEventsAll = AwsRedisClusterEvents & BaseClusterEvents;

class AwsRedisClusterProvider extends AbstractClusterProvider<AllClusterEvents<AwsRedisClusterEvents>> {

    private clusterConfig: AwsRedisClusterConfig;
    // private customEventListeners: EventListeners<AwsRedisClusterEvents> = new Map();

    // // todo: move up
    // private genericEventListeners: EventListeners<ClusterEvents> = new Map();

    constructor(clusterConfig: AwsRedisClusterConfig) {
        super();

        this.clusterConfig = clusterConfig;

        this.addEventListener(AwsRedisClusterEvents.AWS_EVENT_2);
    }


    // public addCustomEventListener(event: AwsRedisClusterEvents, cb: Callback<AwsRedisClusterEvents>) {
    //
    // }

}