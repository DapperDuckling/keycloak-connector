import pino from "pino";
import type {UserData} from "../types.js";

declare module "http" {
    interface IncomingMessage {
        log?: pino.Logger;
        keycloak: UserData;
    }

    interface ServerResponse {
        bigTestBoi?: string;
    }

    interface OutgoingMessage {
        wowOutgoingTest: string;
    }
}
