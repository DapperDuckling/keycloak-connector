import pino from "pino";
import type {UserData} from "../types.js";
import type {ExpressAdapter} from "./express-adapter.js";

declare module "http" {
    interface IncomingMessage {
        log?: pino.Logger;
        kccUserData: UserData;
        kccAdapter?: ExpressAdapter;
        _keycloakReqHandled: boolean;
        //todo: update
    }

    interface ServerResponse {
        //todo: update
        bigTestBoi?: string;
    }

    interface OutgoingMessage {
        //todo: update
        wowOutgoingTest: string;
    }
}
