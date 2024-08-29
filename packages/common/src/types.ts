import type {UserinfoResponse} from "openid-client";

export type UserStatus<Data extends Record<string, any> = Record<string, any>> = Data & {
    loggedIn: boolean;
    userInfo: UserinfoResponse | undefined;
    accessExpires: number;
    refreshExpires: number;
    backend?: Data;
}

export enum TokenType {
    ACCESS,
    REFRESH,
}

export enum SilentLoginEvent {
    CHILD_ALIVE = "CHILD_ALIVE",
    LOGIN_LISTENER_ALIVE = "LOGIN_LISTENER_ALIVE",
    LOGIN_REQUIRED = "LOGIN_REQUIRED",
    LOGIN_SUCCESS = "LOGIN_SUCCESS",
    LOGIN_ERROR = "LOGIN_ERROR",
}

export enum SilentLoginTypes {
    FULL = "FULL",
    PARTIAL = "PARTIAL",
    NONE = "NONE",
}

export enum SilentLogoutTypes {
    FETCH = "FETCH",
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

export type CustomRouteUrl = {
    _prefix?: string;
    loginPage?: string;
    loginPost?: string;
    loginListener?: string;
    logoutPage?: string;
    logoutPost?: string;
    callback?: string;
    logoutCallback?: string;  // Todo: Is this used?
    publicKeys?: string;
    adminUrl?: string;
    backChannelLogout?: string;
    userStatus?: string;
    publicDir?: string;
}

export enum RouteEnum {
    // String enums MUST match key found in CustomRouteUrl type
    LOGIN_PAGE = "loginPage",
    LOGIN_POST = "loginPost",
    LOGIN_LISTENER = "loginListener",
    LOGOUT_PAGE = "logoutPage",
    LOGOUT_POST = "logoutPost",
    CALLBACK = "callback",
    LOGOUT_CALLBACK = "logoutCallback",  // Todo: Is this used?
    PUBLIC_KEYS = "publicKeys",
    ADMIN_URL = "adminUrl",
    BACK_CHANNEL_LOGOUT = "backChannelLogout",
    USER_STATUS = "userStatus",
    PUBLIC_DIR = "publicDir",
}

type SuccessResponse = {
    success: true;
}

type ErrorResponse = {
    success: false;
    error: string;
    errorData?: unknown;
}

export type GeneralResponse = SuccessResponse | ErrorResponse;
