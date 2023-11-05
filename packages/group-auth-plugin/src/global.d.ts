import {GroupAuthData} from "./fastify/index.js";

declare module 'keycloak-connector-server' {
    interface ConnectorRequest {
        kccUserGroupAuthData: GroupAuthData
    }
}

export function add(a: string, b: string): string;
export function add(a: number, b: number): number;
