import type {ConnectorRequest as ConnectorRequestOriginal} from "@dapperduckling/keycloak-connector-server";

export type InheritanceTree = Record<string, string[] | "*">;
export type MappedInheritanceTree = Record<string, Set<string> | "*">;

export interface ConnectorRequest extends ConnectorRequestOriginal<GroupAuthRouteConfig, KcGroupClaims> {
    kccUserGroupAuthData?: GroupAuthData
    kccUserGroupAuthDebug?: GroupAuthDebug[],
}

export interface KcGroupClaims {
    groups?: string[];
}

export interface GroupAuthRouteConfig {
    groupAuths?: GroupAuth[];
}

export type GroupAuth = {
    permission?: string,
    config?: Omit<Partial<GroupAuthConfig>, 'adminGroups|appInheritanceTree|orgInheritanceTree'>,
}

type GroupAuthDebugBase = {
    error?: string,
    matchingGroups?: {
        systemAdmin?: string,
    },
}

export type GroupAuthDebugPrintable = GroupAuthDebugBase & {
    matchingGroups: {
        orgRequirements: Array<string | undefined>,
        appRequirements: Array<string | undefined>,
    }
}

export type GroupAuthDebug = GroupAuthDebugBase & {
    matchingGroups?: {
        orgRequirements: Set<string | undefined>,
        appRequirements: Set<string | undefined>,
    }
}

export type GroupAuthUserStatus = UserGroups & {
    isAppAdmin: boolean,
    isOrgAdmin: boolean,
    isUser: boolean,
    appAdminGroups: string[],
    orgAdminGroups: string[],
}

export type GroupAuthConfig = {
    app: string,
    orgParam?: string | undefined,
    appParam?: string | undefined,
    appIsStandalone?: boolean,
    requireAdmin?: boolean | typeof RequireAdminStringOptions[number],
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

export const RequireAdminStringOptions = [
    "SYSTEM_ADMIN",
    "ALL_APP_ADMIN_ONLY",
    "ALL_ORG_ADMIN_ONLY",
    "APP_ADMINS_ONLY",
    "ORG_ADMINS_ONLY"
] as const;

// export type GroupAuthData = ReturnType<GroupAuthPlugin['exposedEndpoints']> & {
export type GroupAuthData = {
    appId: string | null,
    orgId: string | null,
    standalone: boolean | null,
    systemAdmin: boolean,
}

export type UserGroupPermissions<T = undefined> = T extends "array" ? string[] : Set<string>;

// Removing symbol based key. While good for ensuring no conflicts, it does not lend to passing an object
//  to another application.
// export const UserGroupPermissionKey = Symbol('app-wide permissions');
export const UserGroupPermissionKey = "_";

export type UserGroups = UserGroupsInternal<"array">;

export type UserGroupsInternal<Style = undefined> = {
    isSystemAdmin: boolean,
    isAllAppAdmin: boolean,
    isAllOrgAdmin: boolean,
    organizations: {
        // [UserGroupPermissionKey]?: UserGroupPermissions<T>,
        [orgId: string]: UserGroupPermissions<Style>
    },
    applications: {
        [appId: string]: {
            [UserGroupPermissionKey]: UserGroupPermissions<Style>,
            [orgId: string]: UserGroupPermissions<Style>
        },
    }
    standalone: {
        [appId: string]: {
            [UserGroupPermissionKey]: UserGroupPermissions<Style>,
        }
    }
}

type RegExpExecGroups = Required<Pick<RegExpExecArray, 'groups'>>['groups'];
export type GroupRegexHandlers = Map<RegExp, (userGroups: UserGroupsInternal, matchGroups: RegExpExecGroups) => void>;
