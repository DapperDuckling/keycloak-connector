import {isDev} from "./utils.js";

const STORAGE_SECURE_PREFIX = isDev() ? "__DEV_ONLY__" : "__Host__";
const STORAGE_KCC_PREFIX = "kcc-";
const STORAGE_PREFIX_COMBINED = `${STORAGE_SECURE_PREFIX}${STORAGE_KCC_PREFIX}`;

export const Cookies = Object.freeze({
    CODE_VERIFIER: `${STORAGE_PREFIX_COMBINED}cv`,
    REDIRECT_URI_B64: `${STORAGE_PREFIX_COMBINED}redirect-uri`,
    LOGOUT_REDIRECT_URI_B64: `${STORAGE_PREFIX_COMBINED}logout-redirect-uri`,
    ACCESS_TOKEN: `${STORAGE_PREFIX_COMBINED}access`,
    PUBLIC_ACCESS_TOKEN_EXPIRATION: `${STORAGE_KCC_PREFIX}access-expiration`,
    REFRESH_TOKEN: `${STORAGE_PREFIX_COMBINED}refresh`,
    REFRESH_TOKEN_EXPIRATION: `${STORAGE_PREFIX_COMBINED}refresh-expiration`,
    ID_TOKEN: `${STORAGE_PREFIX_COMBINED}id`,
});

export const CookieNames: string[] = Object.values(Cookies);

/** Array of cookies to keep after login process is complete **/
export const CookiesToKeep: string[] = [
    Cookies.ACCESS_TOKEN,
    Cookies.PUBLIC_ACCESS_TOKEN_EXPIRATION,
    Cookies.REFRESH_TOKEN,
    Cookies.REFRESH_TOKEN_EXPIRATION,
    Cookies.ID_TOKEN,
];

export const LocalStorage = Object.freeze({
    USER_STATUS: `${STORAGE_PREFIX_COMBINED}user-status`,
});
