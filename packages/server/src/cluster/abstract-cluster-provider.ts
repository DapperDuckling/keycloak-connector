import {EventEmitter} from 'node:events';
import type {Logger} from "pino";

import type {Listener} from "../types.js";
import {is} from "typia";
import * as cluster from "cluster";
import {webcrypto} from "crypto";

export enum BaseClusterEvents {
    ERROR = "error",
    BASE = "BASE",
    PRE_CONNECTION = "PRE_CONNECTION",
    CONNECTED = "CONNECTED",
    FULLY_RECONNECTED = "FULLY_RECONNECTED",
}

type InternalClusterMessage<T = unknown> = {
    senderId: string;
    data: T | unknown;
};
export type ClusterMessage<T> = T | unknown;
type SenderId = string;

type AllEvents<T extends string | void> = T extends void ? BaseClusterEvents : BaseClusterEvents | T;

export interface ClusterConfig {
    pinoLogger?: Logger
}

export interface LockOptions {
    key: string,
    ttl: number, // TTL in seconds
}

export type SubscriberListener<T = unknown> = Listener<Promise<void> | void, [ClusterMessage<T>, SenderId]>;

export abstract class AbstractClusterProvider<CustomEvents extends string | void = void> {

    protected clusterConfig: ClusterConfig;
    private eventEmitter = new EventEmitter();
    private listeners: WeakMap<SubscriberListener, Listener> = new WeakMap();
    private senderId = webcrypto.randomUUID();

    protected constructor(clusterConfig: ClusterConfig) {
        // Update pino logger reference
        if (clusterConfig.pinoLogger) {
            clusterConfig.pinoLogger = clusterConfig.pinoLogger.child({"Source": "ClusterProvider"})
        }

        this.clusterConfig = clusterConfig;

        // Setup a NO-OP function for the on error listener on our own event emitter
        this.eventEmitter.on('error', () => {});

    }

    abstract connectOrThrow(): Promise<true>;
    abstract isConnected(isSubscriber: boolean): boolean;
    abstract disconnect(): Promise<boolean>;

    public addListener(event: AllEvents<CustomEvents>, listener: Listener) {
        this.clusterConfig.pinoLogger?.debug(`Adding a listener for '${event}' event`);
        this.eventEmitter.addListener(event, listener);
    }

    public removeListener(event: AllEvents<CustomEvents>, listener: Listener) {
        this.clusterConfig.pinoLogger?.debug(`Removing a listener for '${event}' event`);
        this.eventEmitter.removeListener(event, listener);
    }

    public emitEvent(event: AllEvents<CustomEvents>, ...args: any[]) {
        this.clusterConfig.pinoLogger?.debug(`Emitting an event: '${event}'`);
        this.eventEmitter.emit(event, ...args);
    }

    public async publish<T = unknown>(channel: string, message: T): Promise<boolean> {

        // Create the internal message
        const internalClusterMessage: InternalClusterMessage<T> = {
            senderId: this.senderId,
            data: message,
        }

        // Stringify the message
        const encodedMessage = JSON.stringify(internalClusterMessage);

        // Publish the message
        return this.handlePublish(channel, encodedMessage);
    }

    public async subscribe<T = unknown>(channel: string, listener: SubscriberListener<T>, ignoreOwnMessages = false): Promise<boolean> {

        // Wrap the listener
        const wrappedListener = (encodedMessage: string, channel: string) => setImmediate(async () => {
            try {
                // Decode the message
                const clusterMessage: InternalClusterMessage<T> = JSON.parse(encodedMessage);

                // Ensure the type is correct (will only check for InternalClusterMessage, not the underlying message)
                if (!is<InternalClusterMessage>(clusterMessage)) {
                    this.clusterConfig.pinoLogger?.error(`Received invalid message from channel "${channel}", expected InternalClusterMessage`);
                    return;
                }

                // Check if this message is from ourselves
                if (ignoreOwnMessages && clusterMessage.senderId === this.senderId) {
                    this.clusterConfig.pinoLogger?.debug(`Ignoring message sent from ourself`);
                    return;
                }

                // Call the listener function
                await listener(clusterMessage.data, clusterMessage.senderId);
            } catch (e) {
                this.clusterConfig.pinoLogger?.error(`Received invalid message from channel "${channel}", expected JSON string`);
            }
        });

        // Subscribe to the channel
        return this.handleSubscribe(channel, wrappedListener);
    }

    public async unsubscribe(channel: string, listener: SubscriberListener<any>, silently = false): Promise<boolean> {
        // Grab the wrapped listener
        const wrappedListener = this.listeners.get(listener);

        // Check for no listener
        if (!wrappedListener) {
            // Push an error message
            if (!silently) this.clusterConfig.pinoLogger?.error(`Failed to unsubscribe from ${channel}, provided listener not currently subscribed to any channel`);

            return false;
        }

        // Unsubscribe from the channel
        return this.handleUnsubscribe(channel, wrappedListener);
    }

    protected abstract handleUnsubscribe(channel: string, listener: Listener): Promise<boolean>;
    protected abstract handleSubscribe(channel: string, listener: Listener): Promise<boolean>;
    protected abstract handlePublish(channel: string, message: string): Promise<boolean>;
    public abstract get(key: string): Promise<string | null>;
    public abstract store(key: string, value: string | number | Buffer, ttl: number | null, lockKey?: string): Promise<boolean>;
    public abstract remove(key: string): Promise<boolean>;
    public abstract lock(lockOptions: LockOptions): Promise<boolean>;
    public abstract unlock(lockOptions: LockOptions): Promise<boolean>;

}
