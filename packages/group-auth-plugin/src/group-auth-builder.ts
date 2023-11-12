import type {GroupAuth, GroupAuthConfig, GroupAuthRouteConfig} from "./types.js";

type GroupAuthConfigPartial = Partial<GroupAuthConfig>;

type GroupAuthsArray = Array<string | GroupAuth>;

export function groupAuth(groupAuths: GroupAuthsArray): GroupAuthRouteConfig;
export function groupAuth(groupAuthConfig: GroupAuthConfigPartial): GroupAuthRouteConfig;
export function groupAuth(permission: string, groupAuthConfig?: GroupAuthConfigPartial): GroupAuthRouteConfig;
export function groupAuth(permissionOrConfigOrGroupAuths: GroupAuthsArray | GroupAuthConfigPartial | string, groupAuthConfigOrNothing?: GroupAuthConfigPartial): GroupAuthRouteConfig {

    let permission;
    let groupAuthConfig: Partial<GroupAuthConfig> | undefined;

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
}

const buildGroupAuth = (groupAuthsArray: GroupAuthsArray): GroupAuthRouteConfig => {
    // Transform the group auths
    const groupAuths: GroupAuth[] = groupAuthsArray.map(groupAuth => {
        return typeof groupAuth === "string" ? {permission: groupAuth} : groupAuth;
    });

    return {
        groupAuths: groupAuths
    };
}
