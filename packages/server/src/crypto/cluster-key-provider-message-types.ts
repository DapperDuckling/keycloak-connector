import type {ClusterConnectorKeys} from "./cluster-key-provider.js";

export interface PendingJwksUpdateMsg {
    event: "pending-jwks-update",
    processId: string,
    endOfLockTime: number,
}

export interface CancelPendingJwksUpdateMsg {
    event: "cancel-pending-jwks-update"
    processId: string,
}

export interface NewJwksAvailableMsg {
    event: "new-jwks-available",
    processId: string,
    clusterConnectorKeys: ClusterConnectorKeys
}

export interface RequestUpdateSystemJwksMsg {
    event: "request-update-system-jwks",
    listeningChannel: string,
    requestTime: number,
    jobName?: string,
}

export type ClusterKeyProviderMsgs =
    | PendingJwksUpdateMsg
    | CancelPendingJwksUpdateMsg
    | NewJwksAvailableMsg
    | RequestUpdateSystemJwksMsg;