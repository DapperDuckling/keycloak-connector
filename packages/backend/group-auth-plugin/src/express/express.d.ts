import type {GroupAuthPlugin} from "../group-auth-plugin.js";

declare module "http" {
    interface IncomingMessage {
        kccGroupAuthPlugin?: GroupAuthPlugin;
    }
}
