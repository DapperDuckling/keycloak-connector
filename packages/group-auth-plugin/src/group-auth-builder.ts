import type {GroupAuthConfig, GroupAuthRouteConfig} from "./types.js";

type GroupAuthConfigPartial = Partial<GroupAuthConfig>;
// type GroupAuthReturn = {
//     group: string | undefined;
//     groupAuthConfig: GroupAuthConfigPartial | undefined;
// }

export function groupAuth(groupAuthConfig: GroupAuthConfigPartial): GroupAuthRouteConfig;
export function groupAuth(permission: string, groupAuthConfig?: GroupAuthConfigPartial): GroupAuthRouteConfig;
export function groupAuth(permissionOrConfig: GroupAuthConfigPartial | string, groupAuthConfigOrNothing?: GroupAuthConfigPartial): GroupAuthRouteConfig {

    let permission;
    let groupAuthConfig: Partial<GroupAuthConfig> | undefined;

    // Handle the different functional overloads
    if (typeof permissionOrConfig === "string") {
        permission = permissionOrConfig;
        groupAuthConfig = groupAuthConfigOrNothing;
    } else {
        permission = undefined;
        groupAuthConfig = permissionOrConfig;
    }

    return {
        groupAuth: {
            ...permission !== undefined && {permission: permission},
            ...groupAuthConfig && {config: groupAuthConfig}
        }
    };
}

// export const groupAuthBuilder = (group: string | undefined, groupAuthConfig?: GroupAuthConfigPartial | undefined): GroupAuthRouteConfig => ({
//     groupAuth: {
//         ...group !== undefined && {group: group},
//         ...groupAuthConfig && {config: groupAuthConfig}
//     }
// });
