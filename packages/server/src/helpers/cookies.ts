import {isDev} from "./utils.js";
import {CookieOptionsBase} from "../types.js";

const COOKIE_SECURE_PREFIX = isDev() ? "__DEV_ONLY__" : "__Host__";
const COOKIE_KCC_PREFIX = "kcc-";
const COOKIE_PREFIX_COMBINED = `${COOKIE_SECURE_PREFIX}${COOKIE_KCC_PREFIX}`;

export const Cookies = Object.freeze({
    CODE_VERIFIER: `${COOKIE_PREFIX_COMBINED}cv`,
    REDIRECT_URI_64: `${COOKIE_PREFIX_COMBINED}redirect-uri`,
    ACCESS_TOKEN: `${COOKIE_PREFIX_COMBINED}access`,
    PUBLIC_ACCESS_TOKEN_EXPIRATION: `${COOKIE_KCC_PREFIX}access-expiration`,
    REFRESH_TOKEN: `${COOKIE_PREFIX_COMBINED}refresh`,
});

export const CookieNames: string[] = Object.values(Cookies);

/** Array of cookies to keep after login process is complete **/
export const CookiesToKeep: string[] = [
    Cookies.ACCESS_TOKEN,
    Cookies.PUBLIC_ACCESS_TOKEN_EXPIRATION,
    Cookies.REFRESH_TOKEN,
];