import type {GroupAuth, GroupAuthConfig, GroupAuthRouteConfig} from "./types.js";
import {RequireAdminStringOptions} from "./types.js";

export type GroupAuthConfigPartial = Partial<GroupAuthConfig>;
export type GroupAuthsArray = Array<string | GroupAuth>;

export interface GroupAuthFunc {
    (groupAuths: GroupAuthsArray): GroupAuthRouteConfig;
    (groupAuthConfig: GroupAuthConfigPartial): GroupAuthRouteConfig;
    (permission: string, groupAuthConfig?: GroupAuthConfigPartial): GroupAuthRouteConfig;
    (permissionOrConfigOrGroupAuths?: GroupAuthsArray | GroupAuthConfigPartial | string, groupAuthConfigOrNothing?: GroupAuthConfigPartial): GroupAuthRouteConfig
}

// export function groupAuth(groupAuths: GroupAuthsArray): GroupAuthRouteConfig;
// export function groupAuth(groupAuthConfig: GroupAuthConfigPartial): GroupAuthRouteConfig;
// export function groupAuth(permission: string, groupAuthConfig?: GroupAuthConfigPartial): GroupAuthRouteConfig;
export const groupAuth: GroupAuthFunc = (permissionOrConfigOrGroupAuths, groupAuthConfigOrNothing?: GroupAuthConfigPartial): GroupAuthRouteConfig => {

    let permission;
    let groupAuthConfig: Partial<GroupAuthConfig> | undefined;

    // Check for undefined inputs
    if (permissionOrConfigOrGroupAuths === undefined) return {};

    // Handle arrays separately
    if (Array.isArray(permissionOrConfigOrGroupAuths)) {
        return buildGroupAuth(permissionOrConfigOrGroupAuths);
    }

    // Handle the different functional overloads
    if (typeof permissionOrConfigOrGroupAuths === "string") {
        permission = permissionOrConfigOrGroupAuths;
        groupAuthConfig = groupAuthConfigOrNothing;
    } else {
        permission = undefined;
        groupAuthConfig = permissionOrConfigOrGroupAuths;
    }

    return buildGroupAuth([{
        ...permission !== undefined && {permission: permission},
        ...groupAuthConfig && {config: groupAuthConfig}
    }]);
};

const validateGroupAuthOrThrow = (groupAuth: GroupAuth): void => {
    // Validate require admin option
    if (typeof groupAuth.config?.requireAdmin === "string" && !RequireAdminStringOptions.includes(groupAuth.config?.requireAdmin)) {
        throw new Error(`Invalid require admin option: ${groupAuth.config?.requireAdmin}`);
    }
}

const buildGroupAuth = (groupAuthsArray: GroupAuthsArray): GroupAuthRouteConfig => {
    // Transform the group auths
    const groupAuths: GroupAuth[] = groupAuthsArray.map(groupAuth => {
        if (typeof groupAuth === "string") {
            return {permission: groupAuth};
        } else {
            validateGroupAuthOrThrow(groupAuth);
            return groupAuth;
        }
    });

    return {
        groupAuths: groupAuths
    };
}
