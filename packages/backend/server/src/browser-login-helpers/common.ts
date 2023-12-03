import {SilentLoginEvent as SilentLoginEventType} from "@dapperduckling/keycloak-connector-common/dist/types.js";

export const LOGIN_LISTENER_BROADCAST_CHANNEL = 'login-listener';

/**
 * Converts the enum type to a json object for dynamic use
 */
export const SILENT_LOGIN_EVENT_JSON = JSON.stringify(SilentLoginEventType).replaceAll('"', '\\"');
