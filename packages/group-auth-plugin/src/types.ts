export type InheritanceTree = Record<string, string[] | "*">;
export type MappedInheritanceTree = Record<string, Set<string> | "*">;

export interface KcGroupClaims {
    groups?: string[];
}

export type GroupAuthRouteConfig = {
    groupAuth?: GroupAuth;
}

export type GroupAuth = {
    permission?: string,
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
    defaultRequiredPermission?: string, // default: "user"
    listAllMatchingGroups?: boolean,
    appInheritanceTree?: InheritanceTree, //default: { "admin": "*" }
    orgInheritanceTree?: InheritanceTree, //default: { "admin": "*" }
    noImplicitApp?: boolean, // default: false
}

// export type GroupAuthData = ReturnType<GroupAuthPlugin['exposedEndpoints']> & {
export type GroupAuthData = {
    superAdmin: boolean | null,
    appId: string | null,
    standalone: boolean | null,
    orgId: string | null,
    groups: string[] | null,
    debugInfo: Record<string, any>
}

export type UserGroupPermissions = Set<string>;

export const UserGroupPermissionKey = Symbol('app-wide permissions');

export type UserGroups = {
    organizations: {
        [UserGroupPermissionKey]?: UserGroupPermissions,
        [orgId: string]: UserGroupPermissions
    },
    applications: {
        [appId: string]: {
            [UserGroupPermissionKey]: UserGroupPermissions,
            [orgId: string]: UserGroupPermissions
        },
    }
    standalone: {
        [appId: string]: {
            [UserGroupPermissionKey]: UserGroupPermissions,
        }
    }
}

type RegExpExecGroups = Required<Pick<RegExpExecArray, 'groups'>>['groups'];
export type GroupRegexHandlers = Map<RegExp, (userGroups: UserGroups, matchGroups: RegExpExecGroups) => void>;
