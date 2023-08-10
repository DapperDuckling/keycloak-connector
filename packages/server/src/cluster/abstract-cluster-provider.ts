export enum BaseClusterEvents {
    BASE = "BASE",
    PRE_CONNECTION = "PRE_CONNECTION",
    CONNECTED = "CONNECTED",
}

type AllEvents<T extends string> = T | BaseClusterEvents;

export abstract class AbstractClusterProvider<CustomEvents extends string> {

    // public addEventListener<CustomEvents>(event: CustomEvents, cb: Callback<CustomEvents>) {
    // public addEventListener(event: CustomEvents | BaseClusterEvents) {
    public addEventListener(event: AllEvents<CustomEvents>) {
        this.addEventListener(BaseClusterEvents.BASE);
    }
}
