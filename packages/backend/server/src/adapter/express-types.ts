import pino from "pino";
import type {UserData} from "../types.js";
import type {ExpressAdapter} from "./express-adapter.js";

declare module "http" {
    interface IncomingMessage {
        log?: pino.Logger;
        kccUserData: UserData;
        kccBypass?: boolean;
        kccAdapter?: ExpressAdapter;
        _keycloakReqHandled: boolean;
    }
}

declare global {
    namespace Express {
        // Inject additional properties on express.Request
        interface Request {
            [key: string]: unknown;
        }
    }
}
