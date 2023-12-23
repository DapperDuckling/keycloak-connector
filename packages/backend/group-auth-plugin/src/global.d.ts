
// Import the original type from the library
import type { PluginDecorators } from "@dapperduckling/keycloak-connector-server";
import {GroupAuthData} from "./types.js";

// Extend the original type
declare module "@dapperduckling/keycloak-connector-server" {
    interface PluginDecorators {
        kccUserGroupAuthData: GroupAuthData
    }
}
