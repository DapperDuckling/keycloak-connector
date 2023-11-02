import type {GroupAuthData} from "./fastify/index.js";

declare module 'keycloak-connector-server' {
    interface ConnectorRequest {
        kccGroupAuthData: GroupAuthData
    }
}
