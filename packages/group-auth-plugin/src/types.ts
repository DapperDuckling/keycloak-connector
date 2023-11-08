import type {ConnectorRequest as ConnectorRequestOriginal} from "@dapperduckling/keycloak-connector-server";

export type InheritanceTree = Record<string, string[] | "*">;
export type MappedInheritanceTree = Record<string, Set<string> | "*">;


export interface ConnectorRequest extends ConnectorRequestOriginal<GroupAuthRouteConfig, KcGroupClaims> {
    kccUserGroupAuthData?: GroupAuthData
}

export interface KcGroupClaims {
    groups?: string[];
}

export interface GroupAuthRouteConfig {
    groupAuth?: GroupAuth;
}

export type GroupAuth = {
    permission?: string,
    config?: Omit<Partial<GroupAuthConfig>, 'adminGroups'>,
}

export type GroupAuthUserStatus = {
    isSystemAdmin: boolean,
    isAppAdmin: boolean,
    isAllOrgAdmin: boolean,
    isAllAppAdmin: boolean,
    isOrgAdmin: boolean,
    isUser: boolean,
    orgAdminGroups: string[],
    appAdminGroups: string[],
    allGroupData: UserGroups,
}

export type GroupAuthConfig = {
    app: string,
    orgParam?: string,
    appParam?: string,
    requireAdmin?: boolean,
    adminGroups?: {
        superAdmin?: string,
        allOrgAdmin?: string,
        allAppAdmin?: string,
        appAdmin?: string,
        orgAdmin?: string,
    },
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

export type UserGroupPermissions<T = undefined> = T extends "array" ? string[] : Set<string>;

// Removing symbol based key. While good for ensuring no conflicts, it does not lend to passing an object
//  to another application.
// export const UserGroupPermissionKey = Symbol('app-wide permissions');
export const UserGroupPermissionKey = "_";

export type UserGroups = UserGroupsInternal<"array">;

export type UserGroupsInternal<T = undefined> = {
    systemAdmin: boolean,
    allAppAdmin: boolean,
    allOrgAdmin: boolean,
    organizations: {
        // [UserGroupPermissionKey]?: UserGroupPermissions<T>,
        [orgId: string]: UserGroupPermissions<T>
    },
    applications: {
        [appId: string]: {
            [UserGroupPermissionKey]: UserGroupPermissions<T>,
            [orgId: string]: UserGroupPermissions<T>
        },
    }
    standalone: {
        [appId: string]: {
            [UserGroupPermissionKey]: UserGroupPermissions<T>,
        }
    }
}

type RegExpExecGroups = Required<Pick<RegExpExecArray, 'groups'>>['groups'];
export type GroupRegexHandlers = Map<RegExp, (userGroups: UserGroupsInternal, matchGroups: RegExpExecGroups) => void>;
