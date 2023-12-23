import type {
    AuthPluginInternalConfig,
    AuthPluginOnRegisterConfig,
    DecorateUserStatus,
    UserData
} from "@dapperduckling/keycloak-connector-server";
import {AbstractAuthPlugin, AuthPluginOverride, DecorateResponse} from "@dapperduckling/keycloak-connector-server";
import {isDev} from "@dapperduckling/keycloak-connector-common";
import type {Logger} from "pino";
import type {
    GroupAuthConfig,
    GroupAuthData,
    InheritanceTree,
    KcGroupClaims,
    MappedInheritanceTree, UserGroupPermissions, UserGroupsInternal,
    ConnectorRequest, GroupAuthUserStatus, UserGroups, GroupAuth, GroupAuthDebug, GroupAuthDebugPrintable
} from "./types.js";
import {getUserGroups} from "./group-regex-helpers.js";
import {UserGroupPermissionKey} from "./types.js";
import {depthFirstSearch} from "./helpers/search-algos.js";
import {Narrow} from "./helpers/utils.js";
import {GroupAuthConfigDefaults} from "./helpers/defaults.js";

export class GroupAuthPlugin extends AbstractAuthPlugin {
    protected readonly _internalConfig: AuthPluginInternalConfig = {
        name: 'GroupAuthPlugin',
        override: AuthPluginOverride.OVERRIDE_NONE,
    }
    protected readonly groupAuthConfig: GroupAuthConfig;

    // The tree permissions matching config.inheritanceTree
    private readonly appTreePermissions: MappedInheritanceTree | undefined = undefined;
    private readonly orgTreePermissions: MappedInheritanceTree | undefined = undefined;

    static DEBUG_ANY_ORG = "<ANY-ORG>";
    static DEBUG_MATCHING_ORG = "<MATCHING-ORG>";
    static DEBUG_ANY_APP = "<ANY-APP>";

    constructor(config: GroupAuthConfig) {
        super();

        // Check for an app name
        if (config.app === undefined) {
            throw new Error(`Cannot start group auth plugin, must specify an app name!`);
        }

        this.groupAuthConfig = {
            ...GroupAuthConfigDefaults,
            ...config,
            adminGroups: {
                ...GroupAuthConfigDefaults.adminGroups,
                ...config.adminGroups,
            }
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

    private defaultGroupAuthData = (): GroupAuthData => ({
        systemAdmin: false,
        appId: null,
        orgId: null,
        standalone: null,
        ...this.exposedEndpoints()
    });

    decorateRequestDefaults: DecorateResponse = async ({logger}) => {

        logger?.debug(`Group Auth plugin decorating response`);

        // Decorate the user data with default group info
        return {
            kccUserGroupAuthData: this.defaultGroupAuthData()
        }
    }

    decorateUserStatus: DecorateUserStatus<GroupAuthUserStatus> = async (connectorRequest: ConnectorRequest, logger: Logger | undefined) => {

        // Grab the user info
        const userInfo = connectorRequest.kccUserData?.userInfo;

        // Check if there is no 'groups' property
        if (userInfo !== undefined && userInfo['groups'] === undefined) {
            // Add log message to help initial configurations where keycloak may not be configured correctly
            logger?.debug(`Expected "groups" scope added to user info response from keycloak, but was missing. Are you sure the keycloak client has the group membership scope added?`);
        }

        // Grab all the user groups
        const allUserGroups = userInfo?.["groups"] ?? [];

        const userGroups: UserGroupsInternal = getUserGroups(allUserGroups, this.groupAuthConfig.adminGroups);

        // Get a pure object void of the Set data structure
        const userGroupsPure: UserGroups = JSON.parse(JSON.stringify(userGroups, (key, value) => value instanceof Set ? [...value] : value));

        // Grab a reference to the admin group tokens
        const adminGroups = this.groupAuthConfig.adminGroups ?? {};

        // Generate the group auth user status defaults
        const groupAuthUserStatus: GroupAuthUserStatus = {
            ...userGroupsPure,
            isAppAdmin: userGroupsPure.isAllAppAdmin,
            isOrgAdmin: userGroupsPure.isAllOrgAdmin,
            isUser: false,
            appAdminGroups: [],
            orgAdminGroups: [],
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
        groupAuthUserStatus.isAppAdmin ||= groupAuthUserStatus.appAdminGroups.length > 0;
        groupAuthUserStatus.isOrgAdmin ||= groupAuthUserStatus.orgAdminGroups.length > 0;

        // Help debug permission errors
        if (isDev()) {
            this.logger?.debug(`User's group auth permissions`);
            this.logger?.debug(groupAuthUserStatus);
        }

        return {
            groupAuth: groupAuthUserStatus
        };
    }

    isAuthorized = async (
        connectorRequest: ConnectorRequest,
    ): Promise<boolean> => {

        this.logger?.debug(`Group Auth plugin checking for authorization...`);

        const groupAuths = connectorRequest.routeConfig.groupAuths ?? [{}];
        const userData = connectorRequest.kccUserData;

        // Check for missing user data
        if (userData === undefined) {
            this.logger?.error(`kccUserData is empty!`);
            return false;
        }

        // Add debug info in dev
        if (isDev()) {
            for (const groupAuth of groupAuths) {
                const groupAuthDebug: GroupAuthDebug = {}

                try {
                    // Execute a test only, is authorized call to retrieve all possible routes
                    await this.isAuthorizedGroup(connectorRequest, userData, groupAuth, groupAuthDebug);
                } catch (e) {
                    if (e instanceof Error) groupAuthDebug.error = e.message;
                }

                // Convert the sets to a printable type (array)
                const printableGroupAuthDebug = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug);
                this.logger?.debug(`Group auth input`);
                this.logger?.debug(groupAuth);
                this.logger?.debug(`Group auth output`);
                this.logger?.debug(printableGroupAuthDebug);
            }
        }

        // Check for a "groups" scope in the user info
        if (userData.userInfo?.groups === undefined) {
            this.logger?.warn(`User info does not contain groups scope. Check settings in Keycloak and ensure "Add to userinfo" is selected for the mapped "groups" scope.`);
        }

        // Loop through the group auth options
        for (const groupAuth of groupAuths) {
            // Check if this group auth will authorize
            if (await this.isAuthorizedGroup(connectorRequest, userData, groupAuth)) return true;
        }

        // No authorization found
        return false;
    }

    private async isAuthorizedGroup(
        connectorRequest: ConnectorRequest,
        userData: UserData<KcGroupClaims>,
        groupAuth: GroupAuth,
        debugData?: GroupAuthDebug,
    ) {

        let onlyDebugData = !!debugData && isDev();

        // Create the matching groups object
        const matchingGroups: GroupAuthDebug['matchingGroups'] = {
            appRequirements: new Set<string | undefined>(),
            orgRequirements: new Set<string | undefined>(),
        };

        // Create a debug only object if not already instantiated
        debugData ??= {}

        // Add the matching groups
        debugData.matchingGroups = matchingGroups;

        // Create default group info object
        const kccUserGroupAuthData = this.defaultGroupAuthData();

        if (!onlyDebugData) {
            // Update the user data with the group info object (intentionally overwrite previous objects)
            connectorRequest.pluginDecorators["kccUserGroupAuthData"] = kccUserGroupAuthData;
        }

        // Grab the route's group auth config
        const groupAuthConfig: GroupAuthConfig = {
            ...this.groupAuthConfig,
            ...groupAuth.config
        }

        // Extract the groups from the user info
        const allUserGroups = !onlyDebugData ? userData.userInfo?.groups ?? [] : [];

        // Get enhanced user data
        const userStatusWrapped = await this.decorateUserStatus(connectorRequest as any, this.logger);
        const userStatus = userStatusWrapped['groupAuth'] as GroupAuthUserStatus;

        // Add debug info
        if (groupAuthConfig.adminGroups?.systemAdmin !== undefined) {
            matchingGroups.systemAdmin = groupAuthConfig.adminGroups?.systemAdmin;
        }

        // Check if the user has a group membership that matches the super-user group exactly
        if (!userStatus.isSystemAdmin && groupAuthConfig.requireAdmin === "SYSTEM_ADMIN") {
            // Not a super admin
            kccUserGroupAuthData.systemAdmin = false;
            return false;
        } else if (userStatus.isSystemAdmin) {
            kccUserGroupAuthData.systemAdmin = true;
        }

        // Break apart the user groups into a more manageable object
        const userGroups = getUserGroups(allUserGroups, groupAuthConfig.adminGroups);

        // Grab the route's group auth required permission
        const requiredPermission = groupAuth.permission ?? groupAuthConfig.defaultRequiredPermission;

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
                    break;
                case groupAuthConfig.appParam:
                    constraints.app = paramValue;
                    break;
            }
        }

        // Check for super admin privileges
        if (userStatus.isSystemAdmin) {
            // Add constraint information
            kccUserGroupAuthData.orgId = constraints.org ?? null;
            kccUserGroupAuthData.appId = constraints.app ?? null;
            return true;
        }

        // Check if no valid constraints and the "require admin" flag is not set to an explicit org or app admin
        if (Object.values(constraints).every((constraint: unknown) => typeof constraint !== "string" || constraint.length === 0) &&
            (typeof groupAuthConfig.requireAdmin === "boolean" || groupAuthConfig.requireAdmin === undefined)
        ) {

            // Super admin was already checked, so if this point is reached, they are not a super admin
            this.logger?.debug(`No valid constraints found, so a super admin was required for this route, but user is not super admin`);
            return false;
        }

        const hasOrgAccess = (org: string) => {
            // Check if user has all org admin access
            if (userGroups.isAllOrgAdmin) return true;

            // Check if the user has access to the specified organization
            // (i.e. check if a member has ANY permission in a specific organization)
            if ((userGroups.organizations[org]?.size ?? 0) > 0) {
                this.logger?.debug(`User has org access via a valid (any) user permission for ${org}`);
                return true;
            } else {
                this.logger?.debug(`User does not have org access for ${org}`);
                return false;
            }
        }

        const hasAppPermission = (permission: string, appConstraint: string, orgConstraint: string | undefined): boolean => {

            // Grab permissions from both the regular apps and standalone apps
            const regAppGroups = userGroups.applications[appConstraint];
            const standAloneAppGroups = userGroups.standalone[appConstraint];

            // // Ensure the user does not have permissions for both
            // // Dev note: This is the best runtime checking we can do here. We have to trust keycloak is not misconfigured.
            // if (regAppGroups && standAloneAppGroups) {
            //     throw new Error(`Cannot have application "${appConstraint}" in both the regular application group and standalone group at the same time.`);
            // }

            // Add debug info
            const appPrefix = `/${groupAuthConfig.appIsStandalone ? 'standalone' : 'applications'}/<${groupAuthConfig.appParam}>`;
            matchingGroups.appRequirements.add(groupAuthConfig.adminGroups?.allAppAdmin);

            // Check for all app admin
            if (userGroups.isAllAppAdmin) {
                kccUserGroupAuthData.appId = appConstraint;
                kccUserGroupAuthData.orgId = orgConstraint ?? null;
                return true;
            }

            // Grab the app group to use for this permission check
            // Dev note: The manually generated object at the end here is to help with producing the debug data
            const appGroups = ((groupAuthConfig.appIsStandalone) ? standAloneAppGroups : regAppGroups) ?? {"_": new Set<string>()};

            // // Determine if the user has any application permissions period
            // // todo: test this. I think it may need to check for org based permissions too
            // if (appGroups[UserGroupPermissionKey].size === 0 && !onlyDebugData) {
            //     this.logger?.debug(`User does not have any app permissions for this application`);
            //     return false;
            // }

            // Record if this is a standalone app
            kccUserGroupAuthData.standalone = groupAuthConfig.appIsStandalone ?? false;

            // Grab all the user's app-wide permissions
            const appWidePermissions = appGroups[UserGroupPermissionKey];

            // Add debug info
            matchingGroups.appRequirements.add(`${appPrefix}/${groupAuthConfig.adminGroups?.appAdmin}`);

            // Check for an app admin permission
            if (groupAuthConfig.adminGroups?.appAdmin !== undefined
                && appWidePermissions.has(groupAuthConfig.adminGroups.appAdmin)) {
                kccUserGroupAuthData.appId = appConstraint;
                kccUserGroupAuthData.orgId = orgConstraint ?? null;
                this.logger?.debug(`User has app admin permission`);
                return true;
            }

            // Check if we require an admin
            if (groupAuthConfig.requireAdmin === true || groupAuthConfig.requireAdmin === "APP_ADMINS_ONLY") {
                this.logger?.debug(`Route requires admin, but user is not an application admin`);
                return false;
            }

            // Add debug info
            matchingGroups.appRequirements.add(`${appPrefix}/${permission}`);
            for (const [allowedPermission, inheritedPermissions] of Object.entries(mappedAppInheritanceTree)) {
                if (inheritedPermissions === "*" || inheritedPermissions.has(permission)) {
                    matchingGroups.appRequirements.add(`${appPrefix}/${allowedPermission}`);
                }
            }

            // Check if the user has the required app-wide permission
            const hasRequiredAppWidePermission = this.hasPermission(appWidePermissions, permission, mappedAppInheritanceTree);
            if (hasRequiredAppWidePermission) {
                kccUserGroupAuthData.appId = appConstraint;
                kccUserGroupAuthData.orgId = orgConstraint ?? null;
                return true;
            }

            // If this is a standalone app, there is no org subgroup to check
            // (a user would have to have an "app-wide" permission checked above)
            if (groupAuthConfig.appIsStandalone) {
                this.logger?.debug(`User does not have required permission standalone application`);
                return false;
            }

            // Update app group type because typescript is not smart enough to do it on its own
            Narrow<UserGroupsInternal["applications"][string]>(appGroups);

            // Add debug info
            const orgSection = (orgConstraint && groupAuthConfig.orgParam) ? `<${groupAuthConfig.orgParam}>` : GroupAuthPlugin.DEBUG_ANY_ORG;
            matchingGroups.appRequirements.add(`${appPrefix}/${orgSection}/${permission}`);
            for (const [allowedPermission, inheritedPermissions] of Object.entries(mappedAppInheritanceTree)) {
                if (inheritedPermissions === "*" || inheritedPermissions.has(permission)) {
                    matchingGroups.appRequirements.add(`${appPrefix}/${orgSection}/${allowedPermission}`);
                }
            }

            // Add org debug info
            if (groupAuthConfig.orgParam) {
                const orgSection = (orgConstraint) ? `<${groupAuthConfig.orgParam}>` : GroupAuthPlugin.DEBUG_MATCHING_ORG;
                matchingGroups.orgRequirements.add(groupAuthConfig.adminGroups?.allOrgAdmin);
                matchingGroups.orgRequirements.add(`/organizations/${orgSection}/*`);
            }

            // Scan through the user's app permission organizations
            for (const [org, appOrgPermissions] of Object.entries(appGroups)) {

                // Ignore group level permissions
                if (org === UserGroupPermissionKey) continue;

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

        if (constraints.app !== undefined && groupAuthConfig.requireAdmin !== "ORG_ADMINS_ONLY") {

            // Regular check of app permission and (possibly) org permission
            return hasAppPermission(requiredPermission, constraints.app, constraints.org);

        } else if (groupAuthConfig.requireAdmin === "ALL_APP_ADMIN_ONLY") {
            // Add debug info
            matchingGroups.appRequirements.add(groupAuthConfig.adminGroups?.allAppAdmin ?? "");

            if (userStatus.isAllAppAdmin) {
                kccUserGroupAuthData.appId = constraints.app ?? null;
                kccUserGroupAuthData.orgId = constraints.org ?? null;
                return true;
            }

            return false;

        } else if (groupAuthConfig.requireAdmin === "APP_ADMINS_ONLY") {
            // Add debug info
            matchingGroups.appRequirements.add(groupAuthConfig.adminGroups?.allAppAdmin ?? "");
            matchingGroups.appRequirements.add(`/${groupAuthConfig.appIsStandalone ? 'standalone' : 'applications'}/${GroupAuthPlugin.DEBUG_ANY_APP}/${groupAuthConfig.adminGroups?.appAdmin ?? ""}`);

            if (userStatus.isAppAdmin) {
                kccUserGroupAuthData.orgId = constraints.org ?? null;
                return true;
            }

            return false;

        } else if (constraints.org !== undefined) {

            // Add debug info
            matchingGroups.orgRequirements.add(groupAuthConfig.adminGroups?.allOrgAdmin);

            // Check for an all org admin
            if (userGroups.isAllOrgAdmin) {
                kccUserGroupAuthData.orgId = constraints.org;
                return true;
            }

            // Add debug info
            if (groupAuthConfig.adminGroups?.orgAdmin) {
                matchingGroups.orgRequirements.add(`/organizations/<${groupAuthConfig.orgParam}>/${groupAuthConfig.adminGroups.orgAdmin}`);
            }

            // Check for an org admin permission
            if (groupAuthConfig.adminGroups?.orgAdmin !== undefined
                && userGroups.organizations[constraints.org]?.has(groupAuthConfig.adminGroups.orgAdmin)) {
                kccUserGroupAuthData.orgId = constraints.org;
                return true;
            }

            // Check if we require an admin
            if (groupAuthConfig.requireAdmin === true || groupAuthConfig.requireAdmin === "ORG_ADMINS_ONLY") return false;

            // Add debug info
            matchingGroups.orgRequirements.add(`/organizations/<${groupAuthConfig.orgParam}>/${requiredPermission}`);
            for (const [allowedPermission, inheritedPermissions] of Object.entries(mappedOrgInheritanceTree)) {
                if (inheritedPermissions === "*" || inheritedPermissions.has(requiredPermission)) {
                    matchingGroups.orgRequirements.add(`/organizations/<${groupAuthConfig.orgParam}>/${allowedPermission}`);
                }
            }

            // Check for an organization permission
            const hasOrgPermission = this.hasPermission(userGroups.organizations[constraints.org], requiredPermission, mappedOrgInheritanceTree);
            if (hasOrgPermission) {
                kccUserGroupAuthData.orgId = constraints.org;
                return true;
            }
        } else if (groupAuthConfig.requireAdmin === "ALL_ORG_ADMIN_ONLY") {
            // Add debug info
            matchingGroups.orgRequirements.add(groupAuthConfig.adminGroups?.allOrgAdmin ?? "");
            return userStatus.isAllOrgAdmin;

        } else if (groupAuthConfig.requireAdmin === "ORG_ADMINS_ONLY") {
            // Add debug info
            matchingGroups.orgRequirements.add(groupAuthConfig.adminGroups?.allOrgAdmin ?? "");
            matchingGroups.orgRequirements.add(`/organizations/${GroupAuthPlugin.DEBUG_ANY_ORG}/${groupAuthConfig.adminGroups?.orgAdmin ?? ""}`);

            return userStatus.isOrgAdmin;
        }

        return false;
    }

    private hasPermission(userPermissions: UserGroupPermissions | undefined, requiredPermission: string, mappedInheritanceTree: MappedInheritanceTree) {

        // Check for no user permissions
        if (userPermissions === undefined || userPermissions.size === 0) return false;

        // Check if the required permission is a wildcard
        // (i.e. you can have any permission, but you must have at least one permission to signify org membership)
        if (requiredPermission === "*") return true;

        // Loop through the user permissions and find the first to match
        for (const userPermission of userPermissions) {

            // Grab the mapped positions from the inheritance tree. If no entry in the inheritance tree, just make a
            //  set with this permission in it.
            const mappedPermissions = mappedInheritanceTree[userPermission] ?? new Set([userPermission]);

            // Check if the user has a wildcard permission
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

    static groupAuthDebugToPrintable = (groupAuthDebug: GroupAuthDebug): GroupAuthDebugPrintable => {
        return {
            ...groupAuthDebug,
            matchingGroups: {
                ...groupAuthDebug.matchingGroups,
                orgRequirements: [...groupAuthDebug.matchingGroups?.orgRequirements ?? []],
                appRequirements: [...groupAuthDebug.matchingGroups?.appRequirements ?? []],
            }
        };
    }

}
