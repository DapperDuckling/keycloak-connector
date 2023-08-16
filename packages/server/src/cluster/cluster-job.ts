import type {AbstractClusterProvider} from "./abstract-cluster-provider.js";
import {ClusterMessenger} from "./cluster-messenger.js";
import type {ClusterMessengerConfig} from "./cluster-messenger.js";

export type ClusterJobConfig = ClusterMessengerConfig & {
    initTime: number;
}

export enum ClusterJobEvents {
    START = "start",
    STATUS = "status",
    FINISH = "finish",
    FATAL_ERROR = "fatal_error",
}

export class ClusterJob extends ClusterMessenger {
    private config: ClusterJobConfig;
    private startTime: number | null = null;
    private endTime: number | null = null;

    constructor(config: ClusterJobConfig) {
        super();
        this.config = config;
    }

    async start() {

        // Check for existing start time
        if (this.startTime) throw new Error(`Cluster job already started, cannot start again!`);

        // Store the start time
        this.startTime = Date.now();

        // Send the start message
        await this.config.clusterProvider.publish(
            this.config.targetChannel,
            `${this.config.command}:${ClusterJobEvents.START}`
        );
    }

    async status(msg: string) {
        // Send the status message
        await this.config.clusterProvider.publish(
            this.config.targetChannel,
            `${this.config.command}:${ClusterJobEvents.STATUS}:${msg}`
        );
    }

    async finish() {
        // Check for existing end time
        if (this.endTime) throw new Error(`Cluster job already finished or errored, cannot finish again!`);

        // Store the end time
        this.endTime = Date.now();

        // Send the finish message
        await this.config.clusterProvider.publish(
            this.config.targetChannel,
            `${this.config.command}:${ClusterJobEvents.FINISH}`
        );
    }

    async fatalError(msg: string) {
        // Check for existing end time
        if (this.endTime) throw new Error(`Cluster job already finished or errored, cannot error again!`);

        // Store the end time
        this.endTime = Date.now();

        // Send the fatal error message
        await this.config.clusterProvider.publish(
            this.config.targetChannel,
            `${this.config.command}:${ClusterJobEvents.FATAL_ERROR}:${msg}`
        );
    }

    isFinished() {
        return (this.endTime !== null);
    }
}