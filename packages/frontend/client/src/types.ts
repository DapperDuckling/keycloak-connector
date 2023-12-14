import type {CustomRouteUrl} from "@dapperduckling/keycloak-connector-common";
import type {Logger} from "pino";
import {STORAGE_PREFIX_COMBINED} from "@dapperduckling/keycloak-connector-common";

export enum ClientEvent {
    INVALID_TOKENS = "INVALID_TOKENS",
    START_SILENT_LOGIN = "START_SILENT_LOGIN",

    LOGIN_ERROR = "LOGIN_ERROR",
    LOGOUT_SUCCESS = "LOGOUT_SUCCESS",
    USER_STATUS_UPDATED = "USER_STATUS_UPDATED",
}

export interface ClientConfig {
    /**
     * @description Set the API server's origin if different from the current page's origin
     * to prevent CORS errors
     * @example "http://localhost:4000"
     * @default self.location.origin
     */
    apiServerOrigin?: string;

    /**
     * @description Used if the API server uses custom auth route paths
     * @default {
     *     _prefix: "/auth";
     *     ...
     * }
     */
    routePaths?: CustomRouteUrl;

    /**
     * @description Disables ability for the client to authenticate with Keycloak silently
     * @default false
     */
    disableSilentLogin?: boolean;

    /** Pass a logger to the client. This is useful for debugging and logging.
     *
     * @example
     * import pino from "pino";
     * const logger = pino();
     *
     * const client = new KCClient({logger});
     */
    logger?: Logger;

    /**
     * @desc    When true, the client will not perform a network request to confirm login status if the
     *          user has a valid access token, resulting in an immediate login in some instances.
     * @default false
     */
    fastInitialAuthCheck?: boolean;
}

export const LocalStorage = Object.freeze({
    USER_STATUS: `${STORAGE_PREFIX_COMBINED}user-status`,
});
