import type {
    AuthPluginInternalConfig,
    AuthPluginOnRegisterConfig,
    DecorateUserStatus,
    UserData
} from "@dapperduckling/keycloak-connector-server";
import {AbstractAuthPlugin, AuthPluginOverride} from "@dapperduckling/keycloak-connector-server";
import type {Logger} from "pino";
import type {
    GroupAuthConfig,
    GroupAuthData,
    GroupAuthRouteConfig,
    InheritanceTree,
    KcGroupClaims,
    MappedInheritanceTree, UserGroupPermissions, UserGroupsInternal,
    ConnectorRequest, GroupAuthUserStatus, UserGroups
} from "./types.js";
import {getUserGroups} from "./group-regex-helpers.js";
import {UserGroupPermissionKey} from "./types.js";
import {depthFirstSearch} from "./helpers/search-algos.js";
import {Narrow} from "./helpers/utils.js";
import {GroupAuthConfigDefaults} from "./helpers/defaults.js";
import type {Request} from "express-serve-static-core";

export class GroupAuthPlugin extends AbstractAuthPlugin {
    protected readonly _internalConfig: AuthPluginInternalConfig = {
        name: 'GroupAuthPlugin',
        override: AuthPluginOverride.DISABLE_BASE_FUNCTION
    }
    protected readonly groupAuthConfig: GroupAuthConfig;

    // The tree permissions matching config.inheritanceTree
    private readonly appTreePermissions: MappedInheritanceTree | undefined = undefined;
    private readonly orgTreePermissions: MappedInheritanceTree | undefined = undefined;

    constructor(config: GroupAuthConfig) {
        super();

        // Check for an app name
        if (config.app === undefined) {
            throw new Error(`Cannot start group auth plugin, must specify an app name!`);
        }

        this.groupAuthConfig = {
            ...GroupAuthConfigDefaults,
            ...config
        };

        // Validate the inheritance tree
        this.validateInheritanceTree(config.appInheritanceTree);
        this.validateInheritanceTree(config.orgInheritanceTree);

        // Pre-calculate the inheritance tree permissions
        this.appTreePermissions = this.inheritanceTreePermissions(this.groupAuthConfig.appInheritanceTree);
        this.orgTreePermissions = this.inheritanceTreePermissions(this.groupAuthConfig.orgInheritanceTree);
    }

    public async onPluginRegister(onRegisterConfig: AuthPluginOnRegisterConfig) {
        // Ensure the fetch user info setting is configured
        if (onRegisterConfig.keycloakConfig.fetchUserInfo === undefined || onRegisterConfig.keycloakConfig.fetchUserInfo === false) {
            throw new Error("Must set `fetchUserInfo` in order to use Group Auth Plugin");
        }

        return undefined;
    }

    private validateInheritanceTree = (tree: InheritanceTree | undefined) => {

        if (tree === undefined) return;

        // Store the keys of any elements that are just wildcards
        const wildcardKeys = new Set<string>();
        for (const [key, value] of Object.entries(tree)) {
            if (value === "*") wildcardKeys.add(key);
        }

        // Loop through the tree elements that are not wildcards
        for (const [key, value] of Object.entries(tree)) {
            // Skip the wildcard entries
            if (value === "*") continue;

            // Ensure each of the entries are not a wildcard or a key to a wildcard entry
            if (value.every(permission => permission !== "*" && !wildcardKeys.has(permission))) continue;

            throw new Error(`Invalid inheritance tree with key "${key}". Wildcards must be standalone strings ("*" not ["*"]). Additionally, cannot inherit a permission group that subsequently inherits a wildcard entry.`);
        }
    }

    decorateResponse = async (connectorRequest: ConnectorRequest, userData: UserData, logger: Logger | undefined): Promise<void> => {
        // Decorate the user data with default group info
        connectorRequest.kccUserGroupAuthData = {
            appId: null,
            orgId: null,
            standalone: null,
            superAdmin: null,
            debugInfo: {},
            ...this.exposedEndpoints()
        }

        logger?.debug(`Group Auth plugin decorating response`);
    }

    decorateUserStatus: DecorateUserStatus<GroupAuthUserStatus> = async (connectorRequest: ConnectorRequest, logger: Logger | undefined) => {

        // Break apart the user groups into a more manageable object
        const allUserGroups = connectorRequest.kccUserData?.userInfo?.["groups"] ?? [];

        const userGroups: UserGroupsInternal = getUserGroups(allUserGroups, this.groupAuthConfig.adminGroups);

        // Get a pure object void of the Set data structure
        const userGroupsPure: UserGroups = JSON.parse(JSON.stringify(userGroups, (key, value) => value instanceof Set ? [...value] : value));

        // Grab a reference to the admin group tokens
        const adminGroups = this.groupAuthConfig.adminGroups ?? {};

        // Generate the group auth user status defaults
        const groupAuthUserStatus: GroupAuthUserStatus = {
            isSystemAdmin: userGroups.systemAdmin,
            isAllAppAdmin: userGroups.allAppAdmin,
            isAllOrgAdmin: userGroups.allOrgAdmin,
            isAppAdmin: false,
            isOrgAdmin: false,
            isUser: false,
            orgAdminGroups: [],
            appAdminGroups: [],
            allGroupData: userGroupsPure,
        }

        // Grab a list of app admin groups (application and standalone groups)
        for (let applicationGroup of [userGroups.applications, userGroups.standalone]) {
            for (const [application, permissions] of Object.entries(applicationGroup)) {
                // Check for app admin permission
                if (adminGroups.appAdmin && permissions[UserGroupPermissionKey].has(adminGroups.appAdmin)) {
                    groupAuthUserStatus.appAdminGroups.push(application);
                }
            }
        }

        // Grab a list of org admin groups
        for (const [organization, permissions] of Object.entries(userGroups.organizations)) {
            // Check for org admin permission
            if (adminGroups.orgAdmin && permissions.has(adminGroups.orgAdmin)) {
                groupAuthUserStatus.orgAdminGroups.push(organization);
            }

            // If the user has any organization reference here, they must be a user
            groupAuthUserStatus.isUser = true;
        }

        // Update app and org admin
        groupAuthUserStatus.isAppAdmin = groupAuthUserStatus.appAdminGroups.length > 0;
        groupAuthUserStatus.isOrgAdmin = groupAuthUserStatus.orgAdminGroups.length > 0;

        return {
            groupAuth: groupAuthUserStatus
        };
    }

    isAuthorized = async (
        connectorRequest: ConnectorRequest,
        userData: UserData<KcGroupClaims>,
        logger: Logger | undefined
    ): Promise<boolean> => {

        // Update the logger with a prefix
        logger = logger?.child({"Source": `GroupAuthPlugin`});

        // Create default group info object
        const kccUserGroupAuthData: GroupAuthData = {
            superAdmin: null,
            appId: null,
            standalone: null,
            orgId: null,
            debugInfo: {
                "app-lookup": false,
                "org-lookup": false,
                "route-required-super-admin-only": false,
            },
        }

        // Decorate the user data with the group info object (typescript being wonky)
        connectorRequest.kccUserGroupAuthData = kccUserGroupAuthData;

        logger?.debug(`Group Auth plugin checking for authorization...`);

        // Check for a groupAuth in the routeConfig
        if (connectorRequest.routeConfig.groupAuth === undefined) {
            // No group auth defined, so no restrictions
            //todo: test this theory
            return true;
        }

        // Check for a "groups" scope in the user info
        if (userData.userInfo?.groups === undefined) {
            logger?.warn(`User info does not contain groups scope. Check settings in Keycloak and ensure "Add to userinfo" is selected for the mapped "groups" scope.`);
        }

        // Extract the groups from the user info
        const allUserGroups = userData.userInfo?.groups ?? [];

        // Grab the route's group auth config
        const groupAuthConfig: GroupAuthConfig = {
            ...this.groupAuthConfig,
            ...connectorRequest.routeConfig.groupAuth.config,
        }

        // Check if the user has a group membership that matches the super-user group exactly
        if (groupAuthConfig.adminGroups?.superAdmin !== undefined && allUserGroups.includes(groupAuthConfig.adminGroups.superAdmin)) {
            connectorRequest.kccUserGroupAuthData.superAdmin = true;
            return true;
        }

        // Not a super admin
        kccUserGroupAuthData.superAdmin = false;

        // Break apart the user groups into a more manageable object
        const userGroups = getUserGroups(allUserGroups, groupAuthConfig.adminGroups);

        // Grab the route's group auth required permission
        const requiredPermission = connectorRequest.routeConfig.groupAuth.permission ?? groupAuthConfig.defaultRequiredPermission;

        // Check for a required permission
        if (requiredPermission === undefined) {
            throw new Error(`Required permission not set`);
        }

        // Validate the inheritance tree
        this.validateInheritanceTree(groupAuthConfig.appInheritanceTree);
        this.validateInheritanceTree(groupAuthConfig.orgInheritanceTree);

        // Build the inheritance trees
        const mappedAppInheritanceTree = this.inheritanceTreePermissions(groupAuthConfig.appInheritanceTree);
        const mappedOrgInheritanceTree = this.inheritanceTreePermissions(groupAuthConfig.orgInheritanceTree);

        // Setup the initial constraints using the `app` specified in the initial config unless `noImplicitApp` is specified
        const constraints: { org?: string, app?: string } = {
            ...groupAuthConfig.noImplicitApp !== true && {app: groupAuthConfig.app},
        }

        // Check if we are not ignoring the app constraint, but we do not have a value
        if (groupAuthConfig.noImplicitApp !== true && typeof constraints.app !== "string") {
            throw new Error(`Cannot use group auth without valid app name set! Either set a valid app name or set the ignore app flag. Received "${constraints.app}"`);
        }

        // Loop over the connectorRequest.urlParams and set up a switch statement based on the key
        for (const [paramKey, paramValue] of Object.entries<string>(connectorRequest.urlParams)) {
            switch (paramKey) {
                case groupAuthConfig.orgParam:
                    constraints.org = paramValue;
                    kccUserGroupAuthData.debugInfo["org-lookup"] = paramValue;
                    break;
                case groupAuthConfig.appParam:
                    constraints.app = paramValue;
                    kccUserGroupAuthData.debugInfo["app-lookup"] = paramValue;
                    break;
            }
        }

        // Check if no valid constraints
        if (Object.values(constraints).every((constraint: unknown) => typeof constraint !== "string" || constraint.length === 0)) {
            // No valid constraints assumes we must require a super admin only
            kccUserGroupAuthData.debugInfo["routeRequiredSuperAdminOnly"] = true;

            // Super admin was checked near the beginning, so if this point is reached, they are not a super admin
            logger?.debug(`No valid constraints found, so a super admin was required for this route, but user is not super admin`);
            return false;
        }

        const hasOrgAccess = (org: string) => {
            // Check if user has all org admin access
            if (userGroups.allOrgAdmin) return true;

            // Check if the user has access to the specified organization
            // (i.e. check if a member has ANY permission in a specific organization)
            if ((userGroups.organizations[org]?.size ?? 0) > 0) {
                this.logger?.debug(`User has org access via a valid (any) user permission for ${org}`);
                return true;
            } else {
                this.logger?.debug(`User does not have org access for ${org}`);
                return true;
            }
        }

        const hasAppPermission = (permission: string, appConstraint: string, orgConstraint: string | undefined): boolean => {

            // Grab permissions from both the regular apps and standalone apps
            const regAppGroups = userGroups.applications[appConstraint];
            const standAloneAppGroups = userGroups.standalone[appConstraint];

            // Ensure the user does not have permissions for both
            // Dev note: This is the best runtime checking we can do here. We have to trust keycloak is not misconfigured.
            if (regAppGroups && standAloneAppGroups) {
                throw new Error(`Cannot have application "${appConstraint}" in both the regular application group and standalone group at the same time.`);
            }

            // Check for all app admin
            if (userGroups.allAppAdmin) return true;

            // Grab the app group to use for this permission check
            const appGroups = regAppGroups ?? standAloneAppGroups;

            // Determine if the user has any application permissions period
            if (appGroups === undefined) {
                this.logger?.debug(`User does not have any app permissions for this application`);
                return false;
            }

            // Record if this is a standalone app
            const isStandAloneApp = (regAppGroups === undefined);
            kccUserGroupAuthData.standalone = isStandAloneApp;

            // Grab all the user's app-wide permissions
            const appWidePermissions = appGroups[UserGroupPermissionKey];

            // Check for an app admin permission
            if (groupAuthConfig.adminGroups?.appAdmin !== undefined
                && appWidePermissions.has(groupAuthConfig.adminGroups.appAdmin)) {
                kccUserGroupAuthData.appId = appConstraint;
                this.logger?.debug(`User has app admin permission`);
                return true;
            }

            // Check if the user has the required app-wide permission
            const hasRequiredAppWidePermission = this.hasPermission(appWidePermissions, permission, mappedAppInheritanceTree);
            if (hasRequiredAppWidePermission) {
                kccUserGroupAuthData.appId = appConstraint;
                return true;
            }

            // Check if we require an admin
            if (groupAuthConfig.requireAdmin === true) {
                this.logger?.debug(`Route requires admin, but user is not an application admin`);
                return false;
            }

            // If this is a standalone app, there is no org subgroup to check
            // (a user would have to have an "app-wide" permission checked above)
            if (isStandAloneApp) {
                this.logger?.debug(`User does not have required permission standalone application`);
                return false;
            }

            // Update app group type because typescript is not smart enough to do it on its own
            Narrow<UserGroupsInternal["applications"][string]>(appGroups);

            // Scan through the user's app permission organizations
            for (const [org, appOrgPermissions] of Object.entries(appGroups)) {

                // Ignore group level permissions
                if (org === UserGroupPermissionKey) continue

                // Check if there is an org constraint and this org does not match
                if (orgConstraint !== undefined && orgConstraint !== org) {
                    this.logger?.debug(`User has app permission (may not be the required permission) for org different than required by org constraint`);
                    continue;
                }

                // Check if the user has access to the constrained org
                if (!hasOrgAccess(org)) {
                    this.logger?.debug(`User has app permission via org, but not access to org "${org}"`);
                    continue;
                }

                // Check if the user has the required app permission for the specific org
                if (!this.hasPermission(appOrgPermissions, permission, mappedAppInheritanceTree)) {
                    this.logger?.debug(`User has access to org "${org}", but not required permission to app "${permission}"`);
                    continue;
                }

                // Has org access and app permission for this organization
                kccUserGroupAuthData.appId = appConstraint;
                kccUserGroupAuthData.orgId = org;

                this.logger?.debug(`User has required permission in app and access to org`);
                return true;
            }

            // No match
            this.logger?.debug(`User does not have application permission`);
            return false;
        }

        if (constraints.app !== undefined) {
            // Regular check of app permission and (possibly) org permission
            return hasAppPermission(requiredPermission, constraints.app, constraints.org);

        } else if (constraints.org !== undefined) {
            // Check for an all org admin
            if (userGroups.allOrgAdmin) {
                kccUserGroupAuthData.orgId = constraints.org;
                return true;
            }

            // Check for an org admin permission
            if (groupAuthConfig.adminGroups?.orgAdmin !== undefined
                && userGroups.organizations[constraints.org]?.has(groupAuthConfig.adminGroups.orgAdmin)) {
                kccUserGroupAuthData.orgId = constraints.org;
                return true;
            }

            // Check if we require an admin
            if (groupAuthConfig.requireAdmin === true) return false;

            // Check for an organization permission
            const hasOrgPermission = this.hasPermission(userGroups.organizations[constraints.org], requiredPermission, mappedOrgInheritanceTree);
            if (hasOrgPermission) {
                kccUserGroupAuthData.orgId = constraints.org;
                return true;
            }
        }

        return false;
    }

    private hasPermission(userPermissions: UserGroupPermissions | undefined, requiredPermission: string, mappedInheritanceTree: MappedInheritanceTree) {
        // Check for no user permissions
        if (userPermissions === undefined || userPermissions.size === 0) return false;

        // Loop through the user permissions and find the first to match
        for (const userPermission of userPermissions) {

            // Grab the mapped positions from the inheritance tree. If no entry in the inheritance tree, just make a
            //  set with this permission in it.
            const mappedPermissions = mappedInheritanceTree[userPermission] ?? new Set([userPermission]);

            // Check for a wildcard permission
            if (mappedPermissions === "*") return true;

            // Check if the required permission is within the mapped permissions
            if (mappedPermissions.has(requiredPermission)) return true;
        }

        // No match
        return false;
    }


    private inheritanceTreePermissions(inheritanceTree: InheritanceTree | undefined): MappedInheritanceTree {
        // Check for no inheritance tree
        if (inheritanceTree === undefined) return {};

        // Check if the inheritance tree is the same as the one tied to this class
        if (this.appTreePermissions && this.groupAuthConfig.appInheritanceTree === inheritanceTree) return this.appTreePermissions;
        if (this.orgTreePermissions && this.groupAuthConfig.orgInheritanceTree === inheritanceTree) return this.orgTreePermissions;

        // Extract the wildcards
        const treeWildcardsArray = Object.entries(inheritanceTree).filter(([,value]) => value === "*") as [string, "*"][];
        const treeWildcards = Object.fromEntries(treeWildcardsArray);

        // Extract the non-wildcards
        const treeWithoutWildcardsArray = Object.entries(inheritanceTree).filter(([,value]) => value !== "*") as [string, string[]][];
        const treeWithoutWildcards = Object.fromEntries(treeWithoutWildcardsArray);
        const inheritanceResults = depthFirstSearch(treeWithoutWildcards);

        return {
            ...treeWildcards,
            ...inheritanceResults
        }
    }

    exposedEndpoints = () => ({
        check: this.groupCheck,
    });

    groupAuth = () => {

    }

    groupCheck = () => {

    }

}
