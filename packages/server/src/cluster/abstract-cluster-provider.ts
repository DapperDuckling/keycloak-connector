import { EventEmitter } from 'node:events';
import type {Logger} from "pino";

export enum BaseClusterEvents {
    BASE = "BASE",
    PRE_CONNECTION = "PRE_CONNECTION",
    CONNECTED = "CONNECTED",
}

type AllEvents<T extends string | void> = T extends void ? BaseClusterEvents : BaseClusterEvents | T;
type listener = (...args: any[]) => void;

export interface ClusterConfig {
    pinoLogger?: Logger
}

export abstract class AbstractClusterProvider<CustomEvents extends string | void = void> {

    protected clusterConfig: ClusterConfig;
    private eventEmitter = new EventEmitter();

    protected constructor(clusterConfig: ClusterConfig) {
        this.clusterConfig = clusterConfig;
    }

    abstract connect(...args: any[]): boolean;
    abstract disconnect(...args: any[]): boolean;

    public addListener(event: AllEvents<CustomEvents>, listener: listener) {
        this.clusterConfig.pinoLogger?.debug(`Adding a listener for '${event}' event`);
        this.eventEmitter.addListener(event, listener);
    }

    public removeListener(event: AllEvents<CustomEvents>, listener: listener) {
        this.clusterConfig.pinoLogger?.debug(`Removing a listener for '${event}' event`);
        this.eventEmitter.removeListener(event, listener);
    }

    public emitEvent(event: AllEvents<CustomEvents>, ...args: any[]) {
        this.clusterConfig.pinoLogger?.debug(`Emitting an event: '${event}'`);
        this.eventEmitter.emit(event, ...args);
    }
}
