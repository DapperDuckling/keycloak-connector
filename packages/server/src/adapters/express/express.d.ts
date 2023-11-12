import pino from "pino";
import type {UserData} from "../../types.js";
import type {ExpressAdapter} from "./express-adapter.js";

declare module "http" {
    interface IncomingMessage {
        log?: pino.Logger;
        kccUserData: UserData;
        kccAdapter?: ExpressAdapter;
        _keycloakReqHandled: boolean;
    }
}
