import pino from "pino";
import type {UserData} from "../types.js";

declare module "http" {
    interface IncomingMessage {
        log?: pino.Logger;
        keycloak: UserData;
        _keycloakReqHandled: boolean;
    }

    interface ServerResponse {
        bigTestBoi?: string;
    }

    interface OutgoingMessage {
        wowOutgoingTest: string;
    }
}
