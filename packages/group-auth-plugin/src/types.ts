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
    config?: Omit<Partial<GroupAuthConfig>, 'adminGroups'>,
}

export type GroupAuthConfig = {
    app: string,
    orgParam?: string,
    appParam?: string,
    requireAdmin?: boolean,
    adminGroups?: {
        superAdmin?: string,
        orgAdmin?: string,
        appAdmin?: string,
    }
    defaultRequiredPermission?: string,
    appInheritanceTree?: InheritanceTree,
    orgInheritanceTree?: InheritanceTree,
    noImplicitApp?: boolean,
}

// export type GroupAuthData = ReturnType<GroupAuthPlugin['exposedEndpoints']> & {
export type GroupAuthData = {
    appId: string | null,
    orgId: string | null,
    standalone: boolean | null,
    superAdmin: boolean | null,
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
