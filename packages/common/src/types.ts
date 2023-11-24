import type {UserinfoResponse} from "openid-client";

export type UserStatus<Data extends Record<string, any> = Record<string, any>> = Data & {
    loggedIn: boolean;
    userInfo: UserinfoResponse | undefined;
}

export enum TokenType {
    ACCESS,
    REFRESH,
}

export enum SilentLoginEvent {
    CHILD_ALIVE = "CHILD_ALIVE",
    LOGIN_REQUIRED = "LOGIN_REQUIRED",
    LOGIN_SUCCESS = "LOGIN_SUCCESS",
    LOGIN_ERROR = "LOGIN_ERROR",
}

export enum SilentLoginTypes {
    FULL = "FULL",
    PARTIAL = "PARTIAL",
    NONE = "NONE",
}

export type UserStatusWrapped = {
    md5: string,
    payload: UserStatus,
    timestamp: number,
}

export type SilentLoginMessage = {
    token: string,
    event: SilentLoginEvent,
    data?: UserStatusWrapped,
}

