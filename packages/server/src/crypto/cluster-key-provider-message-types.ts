import type {ClusterConnectorKeys} from "./cluster-key-provider.js";

export interface PendingJwksUpdate {
    event: "pending-jwks-update",
    endOfLockTime: number,
}

export interface CancelPendingJwksUpdate {
    event: "cancel-pending-jwks-update"
}

export interface NewJwksAvailable {
    event: "new-jwks-available",
    clusterConnectorKeys: ClusterConnectorKeys
}

export interface RequestUpdateSystemJwks {
    event: "request-update-system-jwks",
    listeningChannel: string,
    requestTime: number,
    jobName?: string,
}

export type ClusterKeyProviderMessages =
    | PendingJwksUpdate
    | CancelPendingJwksUpdate
    | NewJwksAvailable
    | RequestUpdateSystemJwks;