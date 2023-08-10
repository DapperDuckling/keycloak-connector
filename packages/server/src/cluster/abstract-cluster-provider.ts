export enum BaseClusterEvents {
    BASE = "BASE",
    PRE_CONNECTION = "PRE_CONNECTION",
    CONNECTED = "CONNECTED",
}


// type AllClusterEventsType<CustomEvents = undefined> = BaseClusterEvents & CustomEvents;

export enum AwsRedisClusterEvents {
    "AWS_RANDOM_EVENT" = "AWS_RANDOM_EVENT",
    "AWS_EVENT_2" = "AWS_EVENT_2",
}

// type AllClusterEventss = BaseClusterEvents & AwsRedisClusterEvents;

// export type AllClusterEvents<T = void> = T & BaseClusterEvents;
export type AllClusterEvents<T = undefined> = T extends BaseClusterEvents ? BaseClusterEvents : T | BaseClusterEvents;

const testing: AllClusterEvents<AwsRedisClusterEvents> = AwsRedisClusterEvents.AWS_EVENT_2;


type Callback<Events> = (event: Events) => void;
type EventListeners<Events extends keyof any> = Partial<Record<Events, Map<number, Callback<Events>>>>;
export abstract class AbstractClusterProvider<CustomEvents extends AllClusterEvents = AllClusterEvents> {
// export abstract class AbstractClusterProvider<CustomEvents extends keyof string> {

    // private eventListeners: EventListeners<ClusterEvents> = {};
    private eventListeners: EventListeners<CustomEvents> = {};
    private eventListenerId = 0;

    // protected storeEventListener<Event>(event: Event, cb: Callback<Event>): void {
    //     this.eventListeners[ClusterEvents.PRE_CONNECTION] ??= new Map();
    //     this.eventListeners[ClusterEvents.PRE_CONNECTION].set(
    //         this.eventListenerIds.generic++,
    //         cb
    //     );
    // }
    // public addEventListener<CustomEvents>(event: CustomEvents, cb: Callback<CustomEvents>) {
    public addEventListener(event: AllClusterEvents<CustomEvents>) {
        this.addEventListener(BaseClusterEvents.PRE_CONNECTION);
    }
}
//
// export class ClusterEvents {
//     readonly PRE_CONNECTION = "PRE_CONNECTION";
// }