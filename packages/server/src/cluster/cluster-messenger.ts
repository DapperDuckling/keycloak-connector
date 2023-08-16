import {AbstractClusterProvider} from "./abstract-cluster-provider.js";

export interface ClusterMessengerConfig {
    command: string;
    targetChannel: string;
    clusterProvider: AbstractClusterProvider;
}

export interface ClusterMessage {
    command: string,
    event: string,
    message?: string,
}

export class ClusterMessenger {

    static async message(config: ClusterMessengerConfig, msg: string) {
        // Send message
        await config.clusterProvider.publish(
            config.targetChannel,
            `${config.command}:MESSAGE:${msg}`
        );
    }

    static async messageObj<T>(config: ClusterMessengerConfig, msg: T) {
        await ClusterMessenger.message(config, JSON.stringify(msg));
    }

    static decode(msg: string): ClusterMessage | null {
        // Decode the string
        const result = /^(?<command>[^:]+):(?<event>[^:]+)(:(?<message>.+))?$/.exec(msg);

        // Check for no match
        if (!result) return null;

        // Check for command and event
        if (result.groups?.['command'] === undefined || result.groups?.['event'] === undefined) {
            return null;
        }

        return {
            command: result.groups['command'],
            event: result.groups['event'],
            ...result.groups['message'] && { message: result.groups['message'] }
        }
    }
}