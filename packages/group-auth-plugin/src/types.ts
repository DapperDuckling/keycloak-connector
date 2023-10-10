import type {GroupAuthPlugin} from "./group-auth-plugin.js";

export type InheritanceTree = Record<string, string[]>;
export type GroupAuthConfig = {
    app: string,
    orgParam?: string,
    appParam?: string,
    requireAdmin?: boolean,
    superAdminGroup?: string,
    permission?: string,
    listAllMatchingGroups?: boolean,
    inheritanceTree?: InheritanceTree
}
export type GroupAuthData = ReturnType<GroupAuthPlugin['exposedEndpoints']> & {
    appId: string | null,
    orgId: string | null,
    groups: string[] | null,
    debugInfo: Record<string, any>
}