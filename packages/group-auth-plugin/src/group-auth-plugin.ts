import type {
    AuthPluginInternalConfig,
    AuthPluginOnRegisterConfig,
    ConnectorRequest,
    UserData
} from "keycloak-connector-server";
import {AbstractAuthPlugin, AuthPluginOverride} from "keycloak-connector-server";
import type {Logger} from "pino";
import type {
    GroupAuthConfig,
    GroupAuthData,
    GroupAuthRouteConfig,
    InheritanceTree,
    KcGroupClaims,
    MappedInheritanceTree, UserGroupPermissions, UserGroups
} from "./types.js";
import {getUserGroups} from "./group-regex-helpers.js";
import {UserGroupPermissionKey} from "./types.js";
import {depthFirstSearch} from "./helpers/search-algos.js";
import {Narrow} from "./helpers/utils.js";
import {GroupAuthConfigDefaults} from "./helpers/defaults.js";

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

    public override async onRegister(onRegisterConfig: AuthPluginOnRegisterConfig) {
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
            groups: null,
            debugInfo: {},
            ...this.exposedEndpoints(),
        }

        logger?.debug(`Group Auth plugin decorating response`);
    }

    isAuthorized = async (
        connectorRequest: ConnectorRequest<GroupAuthRouteConfig>,
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
            groups: null,
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
        //todo: uncomment
        // const allUserGroups = userData.userInfo?.groups ?? [];

        //dev only
        const allUserGroups = [
            "/organizations/unit-f4990bd4-7b94-4953-8942-14a7da742a6a/admin",
            "/organizations/unit-02610669-ce6f-4004-a9bb-304243eaf8f4/admin",
            "/organizations/unit-c1be7965-c654-4537-b9b6-b403f4067e87/admin",
            "/organizations/unit-16c4f8fd-0dd9-409c-a95a-23f22aabffc1/admin",
            "/organizations/unit-46be75b1-e27b-4991-bd8b-522e1fbc6c4f/admin",
            "/organizations/unit-323541a7-5fc8-49e5-a33c-4b50bed69d56/admin",
            "/equilibrium-admin",
            "/lost-horizon-admin",
            "/organizations/unit-anyuunt-thanks/member",
            "/organizations/unit-anyuunt-thanks/admin",
            "/organizations/unit-02610669-ce6f-4004-a9bb-304243eaf8f4/member",
            "/organizations/unit-16c4f8fd-0dd9-409c-a95a-23f22aabffc1/member",
            "/organizations/unit-46be75b1-e27b-4991-bd8b-522e1fbc6c4f/member",
            "/organizations/unit-323541a7-5fc8-49e5-a33c-4b50bed69d56/member",
            "/organizations/unit-c1be7965-c654-4537-b9b6-b403f4067e87/member",
            "/spawner-site-admin",
            "/spawner-unit-553-033734cf-697d-48dd-abdc-341ebcbcc5c1",
            "/applications/pegasus/unit-46be75b1-e27b-4991-bd8b-522e1fbc6c4f/user",
            "/applications/pegasus/unit-02610669-ce6f-4004-a9bb-304243eaf8f4/user",
            "/applications/pegasus/unit-323541a7-5fc8-49e5-a33c-4b50bed69d56/user",
            "/applications/pegasus/unit-f4990bd4-7b94-4953-8942-14a7da742a6a/user",
            "/applications/pegasus/unit-16c4f8fd-0dd9-409c-a95a-23f22aabffc1/user",
            "/applications/testing/unit-c1be7965-c654-4537-b9b6-b403f4067e87/user",
            "/standalone/nope1/user",
            "/standalone/nope2/user",
            "/standalone/nope51/admin",
            "/standalone/nope51/user",
            "/applications/pegasus/app-admin",
            "/applications/yarp/app-admin",
            "/applications/testing/app-admin",
        ];

        // Grab the route's group auth config
        const groupAuthConfig: GroupAuthConfig = {
            ...this.groupAuthConfig,
            ...connectorRequest.routeConfig.groupAuth.config,
        }

        // Check if the user has a group membership that matches the super-user group exactly
        if (groupAuthConfig.adminGroups?.superAdmin && allUserGroups.includes(groupAuthConfig.adminGroups.superAdmin)) {
            connectorRequest.kccUserGroupAuthData.superAdmin = true;
            return true;
        }

        // Not a super admin
        kccUserGroupAuthData.superAdmin = false;

        // Break apart the user groups into a more manageable object
        const userGroups = getUserGroups(allUserGroups);

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
        for (const [paramKey, paramValue] of Object.entries(connectorRequest.urlParams)) {
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
            // Check if the user has org-wide admin access
            if (groupAuthConfig.adminGroups?.orgAdmin &&
                userGroups.organizations[UserGroupPermissionKey]?.has(groupAuthConfig.adminGroups.orgAdmin)) {
                return true;
            }

            // Check if the user has access to the specified organization
            // (i.e. check if a member has ANY permission in a specific organization)
            return (userGroups.organizations[org]?.size ?? 0) > 0;
        }

        const hasAppPermission = (permission: string, appConstraint: string, orgConstraint: string | undefined) => {

            // Grab permissions from both the regular apps and standalone apps
            const regAppGroups = userGroups.applications[appConstraint];
            const standAloneAppGroups = userGroups.standalone[appConstraint];

            // Ensure the user does not have permissions for both
            // Dev note: This is the best runtime checking we can do here. We have to trust keycloak is not misconfigured.
            if (regAppGroups && standAloneAppGroups) {
                throw new Error(`Cannot have application "${appConstraint}" in both the regular application group and standalone group at the same time.`);
            }

            // Grab the app group to use for this permission check
            const appGroups = regAppGroups ?? standAloneAppGroups;

            // Determine if the user has any application permissions period
            if (appGroups === undefined) return false;

            // Record if this is a standalone app
            const isStandAloneApp = (regAppGroups === undefined);

            // Grab all the user's app-wide permissions
            const appWidePermissions = appGroups[UserGroupPermissionKey];

            // Check for an app admin permission
            if (groupAuthConfig.adminGroups?.appAdmin !== undefined
                && appWidePermissions.has(groupAuthConfig.adminGroups.appAdmin)) {
                return true;
            }

            // Check if the user has the required app-wide permission
            const hasAppWidePermission = this.hasPermission(appWidePermissions, permission, mappedAppInheritanceTree);
            if (hasAppWidePermission) return true;

            // If this is a standalone app, there is no org subgroup to check
            if (isStandAloneApp) return false;

            // Update app group type because typescript is not smart enough to do it on its own
            Narrow<UserGroups["applications"][string]>(appGroups);

            // Scan through the user's app permission organizations
            // Dev note: Object.entries() will automatically exclude the `Symbol()` key (e.g. UserGroupPermissionKey)
            for (const [org, appOrgPermissions] of Object.entries(appGroups)) {

                // Check if there is an org constraint and this org does not match
                if (orgConstraint && orgConstraint !== org) continue;

                // Check if the user has access to the constrained org
                if (!hasOrgAccess(org)) continue;

                // Check if the user has the required app permission for the specific org
                if (!this.hasPermission(appOrgPermissions, permission, mappedAppInheritanceTree)) continue;

                // Has org access and app permission for this organization
                return true;
            }

            // No match
            return false;
        }

        if (constraints.app) {
            // Regular check of app permission and (possibly) org permission
            return hasAppPermission(requiredPermission, constraints.app, constraints.org);

        } else if (constraints.org) {
            // Check for an org admin permission
            if (groupAuthConfig.adminGroups?.orgAdmin !== undefined
                && userGroups.organizations[UserGroupPermissionKey]?.has(groupAuthConfig.adminGroups.orgAdmin)) {
                return true;
            }

            // Check for an organization permission
            return this.hasPermission(userGroups.organizations[constraints.org], requiredPermission, mappedOrgInheritanceTree);
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
