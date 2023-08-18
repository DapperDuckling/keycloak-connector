import type {AbstractClusterProvider} from "./abstract-cluster-provider.js";

export type ClusterJobConfig = {
    requestTimestamp: number;
    clusterProvider: AbstractClusterProvider;
    targetChannel: string;
    jobName?: string;
}

export enum ClusterJobEvents {
    START = "start",
    HEARTBEAT = "status",
    FINISH = "finish",
    FATAL_ERROR = "fatal_error",
}

export type ClusterJobMessage = {
    event: string;
    timestamp: number;
    duration: number;
    jobName?: string;
    remarks?: string;
}

export class ClusterJob {
    private config: ClusterJobConfig;
    private startTimestamp: number | null = null;
    private endTimestamp: number | null = null;

    constructor(config: ClusterJobConfig) {
        this.config = config;
    }

    private async publishMessage(event: string, remarks?: string) {
        const timestamp = Date.now() / 1000;
        const duration = Math.max(timestamp - this.config.requestTimestamp, -1);
        await this.config.clusterProvider.publish<ClusterJobMessage>(this.config.targetChannel,
            {
                event: event,
                timestamp: Date.now() / 1000,
                duration: duration,
                ...this.config.jobName && {jobName: this.config.jobName},
                ...remarks && {remarks: remarks},
            }
        );
    }

    async start() {

        // Check for existing start time
        if (this.startTimestamp) throw new Error(`Cluster job already started, cannot start again!`);

        // Store the start time
        this.startTimestamp = Date.now();

        // Send the start message
        await this.publishMessage(ClusterJobEvents.START);
    }

    async heartbeat(remarks: string) {
        await this.publishMessage(ClusterJobEvents.HEARTBEAT, remarks);
    }

    async finish() {
        // Check for existing end time
        if (this.endTimestamp) throw new Error(`Cluster job already finished or errored, cannot finish again!`);

        // Store the end time
        this.endTimestamp = Date.now();

        // Send the finish message
        await this.publishMessage(ClusterJobEvents.FINISH);
    }

    async fatalError(msg: string) {
        // Check for existing end time
        if (this.endTimestamp) throw new Error(`Cluster job already finished or errored, cannot error again!`);

        // Store the end time
        this.endTimestamp = Date.now();

        // Send the fatal error message
        await this.publishMessage(ClusterJobEvents.FATAL_ERROR);
    }

    isFinished() {
        return (this.endTimestamp !== null);
    }
}