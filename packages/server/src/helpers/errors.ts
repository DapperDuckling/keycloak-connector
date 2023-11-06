import type {ConnectorResponse, CookieParams} from "../types.js";
import type {SupportedServers} from "../types.js";

export class ConnectorErrorRedirect<Server extends SupportedServers> implements ConnectorResponse<Server> {
    responseText?: string;
    serveFile?: string;
    redirectUrl?: string;
    cookies?: CookieParams<Server>[];
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
