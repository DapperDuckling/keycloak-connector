import {isDev} from "./utils.js";

const COOKIE_SECURE_PREFIX = isDev() ? "__DEV_ONLY__" : "__Host__";
const COOKIE_KCC_PREFIX = "kcc-";
const COOKIE_PREFIX_COMBINED = `${COOKIE_SECURE_PREFIX}${COOKIE_KCC_PREFIX}`;

export const Cookies = Object.freeze({
    CODE_VERIFIER: `${COOKIE_PREFIX_COMBINED}cv`,
    REDIRECT_URI_B64: `${COOKIE_PREFIX_COMBINED}redirect-uri`,
    LOGOUT_REDIRECT_URI_B64: `${COOKIE_PREFIX_COMBINED}logout-redirect-uri`,
    ACCESS_TOKEN: `${COOKIE_PREFIX_COMBINED}access`,
    PUBLIC_ACCESS_TOKEN_EXPIRATION: `${COOKIE_KCC_PREFIX}access-expiration`,
    REFRESH_TOKEN: `${COOKIE_PREFIX_COMBINED}refresh`,
    REFRESH_TOKEN_EXPIRATION: `${COOKIE_PREFIX_COMBINED}refresh-expiration`,
});

export const CookieNames: string[] = Object.values(Cookies);

/** Array of cookies to keep after login process is complete **/
export const CookiesToKeep: string[] = [
    Cookies.ACCESS_TOKEN,
    Cookies.PUBLIC_ACCESS_TOKEN_EXPIRATION,
    Cookies.REFRESH_TOKEN,
    Cookies.REFRESH_TOKEN_EXPIRATION,
];