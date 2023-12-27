import type {GroupAuthPlugin} from "../group-auth-plugin.js";
import * as http from "http";

declare module "http" {
    interface IncomingMessage {
        kccGroupAuthPlugin?: GroupAuthPlugin;
    }
}
