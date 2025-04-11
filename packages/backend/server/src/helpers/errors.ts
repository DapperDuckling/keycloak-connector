import type {ConnectorResponse, SupportedServers} from "../types.js";
import {CookieStore} from "../cookie-store.js";

export class ConnectorErrorRedirect<Server extends SupportedServers> implements ConnectorResponse<Server> {
    responseText?: string;
    serveFileFullPath?: string;
    redirectUrl?: string;
    cookies?: CookieStore<Server>;
    statusCode: number;

    private readonly originalRedirectUrl: string;

    constructor(redirectUrl: string, hint?: string) {
        this.statusCode = 303;
        this.originalRedirectUrl = redirectUrl;
        this.hint = hint;
    }

    set hint(hint: string | undefined) {
        this.redirectUrl = this.originalRedirectUrl + (hint ? `#${hint}` : '');
    }
}

export enum ErrorHints {
    CODE_400 = "CODE_400",
    CODE_500 = "CODE_500",
    UNAUTHENTICATED = "UNAUTHENTICATED",
    UNAUTHORIZED = "UNAUTHORIZED",
    JWT_EXPIRED = "JWT_EXPIRED",
    UNKNOWN = "UNKNOWN",
}

export class LoginError extends Error {

    private readonly _hint: ErrorHints;
    private readonly _redirect: boolean;

    constructor(hint: ErrorHints, {
        description,
        redirect,
    }: {
        description?: string,
        redirect?: boolean,
    } = {}) {
        super(description ?? hint);
        this._hint = hint;
        this._redirect = redirect ?? true;

        Object.setPrototypeOf(this, LoginError.prototype);
    }

    get redirect(): boolean {
        return this._redirect;
    }
    get hint(): ErrorHints {
        return this._hint;
    }
}

export class WaitTimeoutError extends Error {
    waitedTimeSec: number;

    constructor(waitedTimeMs: number) {
        super(`Ran out of time waiting for promise to finish`);
        this.waitedTimeSec = waitedTimeMs / 1000;
    }
}

export class AuthServerError extends Error {}
export class AuthClientError extends Error {}