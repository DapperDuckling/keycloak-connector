export type InheritanceTree = Record<string, string[] | "*">;

export interface KcGroupClaims {
    groups?: string[];
}

export type GroupAuthRouteConfig = {
    groupAuth?: GroupAuth;
}

export type GroupAuth = {
    group?: string,
    config?: Partial<GroupAuthConfig>,
}

export type GroupAuthConfig = {
    app: string,
    orgParam?: string, // default: ":org_id"
    appParam?: string, // default: ":app_name"
    requireAdmin?: boolean, // default: false
    adminGroups?: {
        superAdmin?: string, // default: "/darksaber-admin"
        orgAdmin?: string,  // default: "admin", //todo: change this to org-admin
        appAdmin?: string,  // default: "app-admin"
    }
    defaultRequiredGroup?: string, // default: "user"
    listAllMatchingGroups?: boolean,
    inheritanceTree?: InheritanceTree, //default: { "admin": "*" }
    noImplicitApp?: boolean, // default: false
}

// export type GroupAuthData = ReturnType<GroupAuthPlugin['exposedEndpoints']> & {
export type GroupAuthData = {
    superAdmin: boolean | null,
    appId: string | null,
    orgId: string | null,
    groups: string[] | null,
    debugInfo: Record<string, any>
}

type UserGroupPermissions = Set<string>;

export const UserGroupPermissionKey = Symbol('app-wide permissions');

export type UserGroups = {
    organizations: {
        [orgId: string]: UserGroupPermissions
    },
    applications: {
        [appId: string]: UserGroups['organizations'] & {
            [UserGroupPermissionKey]: UserGroupPermissions
        }
    }
}

type RegExpExecGroups = Required<Pick<RegExpExecArray, 'groups'>>['groups'];
export type GroupRegexHandlers = Map<RegExp, (userGroups: UserGroups, matchGroups: RegExpExecGroups) => void>;
