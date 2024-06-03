import {type CookieOptionsBase, CookieParams, ReqCookies, SupportedServers} from "./types.js";
import {ConnectorCookieNames, ConnectorCookiesToKeep} from "@dapperduckling/keycloak-connector-common";

export class CookieStore<Server extends SupportedServers> {
    private cookies: CookieParams<Server>[] = [];
    private readonly globalOptions: CookieParams<Server>['options'];

    private constructor(globalOptions: CookieParams<Server>['options']) {
        this.globalOptions = globalOptions;
    }

    private toObject = (): ReqCookies => {
        // Convert the cookies into an object based store
        return this.cookies.reduce((cookieStore,currentCookie) => ({...cookieStore, [currentCookie.name]: currentCookie.value}),{});
    }

    merge = (cookies: CookieStore<Server>) => {
        this.cookies.push(...cookies.cookies);
        return this;
    }

    /**
     *
     * @param cookieParams
     * @param overrideOptions - Overrides global cookie params or, if true, prevents global cookie params from being added
     */
    add = (cookieParams: CookieParams<Server> | CookieParams<Server>[], overrideOptions?: CookieParams<Server>['options'] | true) => {

        const cookieParamArray = Array.isArray(cookieParams) ? cookieParams : [cookieParams];

        // Loop through the cookie params
        for (const cookieParams of cookieParamArray) {
            // Add the global cookie param options
            if (overrideOptions !== true) {
                cookieParams.options = {
                    ...cookieParams.options,
                    ...this.globalOptions,
                }
            }

            // Add any override cookie param options
            if (overrideOptions && overrideOptions !== true) {
                cookieParams.options = {
                    ...cookieParams.options,
                    ...overrideOptions,
                }
            }

            // Store the cookie params
            this.cookies.push(cookieParams);
        }

        return this;
    }

    updatedReqCookies = (reqCookies: ReqCookies) => ({
        ...reqCookies,
        ...this.toObject(),
    })

    get = () => this.cookies;

    removeAuthCookies = (reqCookies: ReqCookies, overrideOptions?: CookieParams<Server>['options']) => {
        // Scan through request cookies to find ones to remove
        for (const cookieName of Object.keys(reqCookies)) {
            if (ConnectorCookiesToKeep.includes(cookieName)) {
                this.add({
                    name: cookieName,
                    value: "",
                    options: {
                        ...(overrideOptions ? overrideOptions : {}),
                        expires: new Date(0),
                    }
                })
            }
        }

        return this;
    }

    removeAuthFlowCookies = (reqCookies: ReqCookies, authFlowNonce: string, overrideOptions?: CookieParams<Server>['options']) => {
        // Scan through request cookies to find ones to remove
        for (const cookieName of Object.keys(reqCookies)) {
            if (ConnectorCookieNames.some(name => `${name}-${authFlowNonce}` === cookieName) && !ConnectorCookiesToKeep.includes(cookieName)) {
                this.add({
                    name: cookieName,
                    value: "",
                    options: {
                        ...(overrideOptions ? overrideOptions : {}),
                        expires: new Date(0),
                    }
                })
            }
        }

        return this;
    }

    static generator = <Server extends SupportedServers>(globalOptions: CookieParams<Server>['options']) => {
        return () => new CookieStore(globalOptions);
    }
}
