import type {GroupAuthConfig} from "./types.js";

type GroupAuthConfigPartial = Partial<GroupAuthConfig>;
type GroupAuthReturn = {
    group: string | undefined;
    groupAuthConfig: GroupAuthConfigPartial | undefined;
}

export function groupAuth(groupAuthConfig: GroupAuthConfigPartial): GroupAuthReturn;
export function groupAuth(group: string, groupAuthConfig?: GroupAuthConfigPartial): GroupAuthReturn;
export function groupAuth(groupOrConfig: GroupAuthConfigPartial | string, groupAuthConfigOrNothing?: GroupAuthConfigPartial): GroupAuthReturn {

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

    return {group, groupAuthConfig};
}
