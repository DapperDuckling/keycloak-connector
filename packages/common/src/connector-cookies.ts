import {isDev} from "./utils.js";

const STORAGE_SECURE_PREFIX = isDev() ? "__DEV_ONLY__" : "__Host__";
const STORAGE_KCC_PREFIX = "kcc-";
export const STORAGE_PREFIX_COMBINED = `${STORAGE_SECURE_PREFIX}${STORAGE_KCC_PREFIX}`;

export const ConnectorCookies = Object.freeze({
    CODE_VERIFIER: `${STORAGE_PREFIX_COMBINED}cv`,
    REDIRECT_URI_B64: `${STORAGE_PREFIX_COMBINED}redirect-uri`,
    LOGOUT_REDIRECT_URI_B64: `${STORAGE_PREFIX_COMBINED}logout-redirect-uri`,
    ACCESS_TOKEN: `${STORAGE_PREFIX_COMBINED}access`,
    REFRESH_TOKEN: `${STORAGE_PREFIX_COMBINED}refresh`,
    REFRESH_TOKEN_EXPIRATION: `${STORAGE_PREFIX_COMBINED}refresh-expiration`,
    ID_TOKEN: `${STORAGE_PREFIX_COMBINED}id`,
});

export const ConnectorCookieNames: Readonly<string[]> = Object.values(ConnectorCookies);

/** Array of cookies to keep after login process is complete **/
export const ConnectorCookiesToKeep: Readonly<string[]> = [
    ConnectorCookies.ACCESS_TOKEN,
    ConnectorCookies.REFRESH_TOKEN,
    ConnectorCookies.REFRESH_TOKEN_EXPIRATION,
    ConnectorCookies.ID_TOKEN,
];
