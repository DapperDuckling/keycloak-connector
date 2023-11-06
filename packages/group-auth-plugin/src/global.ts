mport type {GroupAuthData} from "./types.js";

declare module 'keycloak-connector-server' {
    interface ConnectorRequest {
        kccUserGroupAuthData: GroupAuthData
    }
}
