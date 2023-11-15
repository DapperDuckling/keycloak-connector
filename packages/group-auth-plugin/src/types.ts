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
    groupAuths?: GroupAuth[];
}

export type GroupAuth = {
    permission?: string,
    config?: Omit<Partial<GroupAuthConfig>, 'adminGroups'>,
}

export type GroupAuthDebug = {
    error?: string,
    matchingGroups?: {
        orgRequirements: Set<string | undefined>,
        appRequirements: Set<string | undefined>
    },
}

export type GroupAuthUserStatus = UserGroups & {
    isAppAdmin: boolean,
    isOrgAdmin: boolean,
    isUser: boolean,
    orgAdminGroups: string[],
    appAdminGroups: string[],
}

export type GroupAuthConfig = {
    app: string,
    orgParam?: string | undefined,
    appParam?: string | undefined,
    requireAdmin?: boolean | "APP_ADMIN_ONLY" | "ORG_ADMIN_ONLY" | "SYSTEM_ADMIN",
    adminGroups?: {
        systemAdmin?: string,
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
    systemAdmin: boolean | null,
    debugInfo: {
        [key: string]: any,
        // "matching-groups": Set<string | undefined>,
    }
}

export type UserGroupPermissions<T = undefined> = T extends "array" ? string[] : Set<string>;

// Removing symbol based key. While good for ensuring no conflicts, it does not lend to passing an object
//  to another application.
// export const UserGroupPermissionKey = Symbol('app-wide permissions');
export const UserGroupPermissionKey = "_";

export type UserGroups = UserGroupsInternal<"array">;

export type UserGroupsInternal<T = undefined> = {
    isSystemAdmin: boolean,
    isAllAppAdmin: boolean,
    isAllOrgAdmin: boolean,
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
