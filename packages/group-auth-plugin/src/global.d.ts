import type {GroupAuthData} from "./fastify/index.js";
import {UserinfoResponse} from "openid-client";
import type {KcGroupClaims} from "./types.js";

declare module 'keycloak-connector-server' {
    interface ConnectorRequest {
        kccUserGroupAuthData: GroupAuthData
    }

    // interface UserData {
    //     userInfo?: UserinfoResponse<KcGroupClaims>;
    // }
}
