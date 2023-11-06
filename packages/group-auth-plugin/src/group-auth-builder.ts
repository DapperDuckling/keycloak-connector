import type {GroupAuthConfig, GroupAuthRouteConfig} from "./types.js";

type GroupAuthConfigPartial = Partial<GroupAuthConfig>;
// type GroupAuthReturn = {
//     group: string | undefined;
//     groupAuthConfig: GroupAuthConfigPartial | undefined;
// }

export function groupAuth(groupAuthConfig: GroupAuthConfigPartial): GroupAuthRouteConfig;
export function groupAuth(group: string, groupAuthConfig?: GroupAuthConfigPartial): GroupAuthRouteConfig;
export function groupAuth(groupOrConfig: GroupAuthConfigPartial | string, groupAuthConfigOrNothing?: GroupAuthConfigPartial): GroupAuthRouteConfig {

    let group;
    let groupAuthConfig: Partial<GroupAuthConfig> | undefined;

    // Handle the different functional overloads
    if (typeof groupOrConfig === "string") {
        group = groupOrConfig;
        groupAuthConfig = groupAuthConfigOrNothing;
    } else {
        group = undefined;
        groupAuthConfig = groupOrConfig;
    }

    // return {group, groupAuthConfig};
    return {
        groupAuth: {
            ...group !== undefined && {group: group},
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
