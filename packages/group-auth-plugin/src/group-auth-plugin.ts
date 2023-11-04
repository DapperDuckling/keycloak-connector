import type {
    AuthPluginInternalConfig,
    AuthPluginOnRegisterConfig,
    ConnectorRequest,
    UserData
} from "keycloak-connector-server";
import {AbstractAuthPlugin, AuthPluginOverride} from "keycloak-connector-server";
import type {Logger} from "pino";
import type {GroupAuthConfig, GroupAuthData, GroupAuthRouteConfig, InheritanceTree, KcGroupClaims} from "./types.js";
import {getUserGroups} from "./group-regex-helpers.js";
import {UserGroupPermissionKey} from "./types.js";

export class GroupAuthPlugin extends AbstractAuthPlugin {
    protected readonly _internalConfig: AuthPluginInternalConfig = {
        name: 'GroupAuthPlugin',
        override: AuthPluginOverride.DISABLE_BASE_FUNCTION
    }
    protected readonly groupAuthConfig: GroupAuthConfig;

    // The tree permissions matching config.inheritanceTree
    protected treePermissions: Record<string, Set<string>> | undefined = undefined;

    constructor(config: GroupAuthConfig) {
        super();

        // Check for an app name
        if (config.app === undefined) {
            throw new Error(`Cannot start group auth plugin, must specify an app name!`);
        }

        this.groupAuthConfig = config;

        // Validate the inheritance tree
        this.validateInheritanceTree(config.inheritanceTree);

        // Pre-calculate the inheritance tree permissions
        this.treePermissions = this.inheritanceTreePermissions(config.inheritanceTree);
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

            // Ensure each of the entries are not a wildcard or in the wildcard keys
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

        // Create default group info object
        const kccUserGroupAuthData: GroupAuthData = {
            superAdmin: null,
            appId: null,
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

        //todo: check if we are using the defaults (or setting the defaults per the use case gist)

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
            "/applications/pegasus/app-admin",
            "/applications/yarp/app-admin",
            "/applications/testing/app-admin",
        ];

        // Check if the user has a group membership that matches the super-user group exactly
        if (this.groupAuthConfig.adminGroups?.superAdmin && allUserGroups.includes(this.groupAuthConfig.adminGroups.superAdmin)) {
            connectorRequest.kccUserGroupAuthData.superAdmin = true;
            return true;
        }

        // Not a super admin
        kccUserGroupAuthData.superAdmin = false;

        // Break apart the user groups into a more manageable object
        const userGroups = getUserGroups(allUserGroups);

        // Grab the route's group auth config
        const groupAuthConfig: GroupAuthConfig = {
            ...this.groupAuthConfig,
            ...connectorRequest.routeConfig.groupAuth.config,
        }

        // Validate the inheritance tree
        this.validateInheritanceTree(groupAuthConfig.inheritanceTree);

        // Build the inheritance tree
        const inheritanceTreePermissions = this.inheritanceTreePermissions(groupAuthConfig.inheritanceTree);

        const constraints: { org?: string, app?: string } = {
            app: groupAuthConfig.app,
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

        // Removed: Just check in the actual check if the length is 0, then deny that check immediately (since we don't know how each HTTP server will handle this)
        // // Ensure the constraints are all strings of length >0
        // for (const [constraintKey, constraintValue] of Object.entries<unknown>(constraints)) {
        //     if (typeof constraintValue !== "string" || constraintValue.length === 0) {
        //         throw new Error(`Cannot use group auth without valid ${constraintKey} set! Non-string or empty string value received`);
        //     }
        // }

        // Check if no valid constraints
        if (Object.values(constraints).every((constraint: unknown) => typeof constraint !== "string" || constraint.length === 0)) {
            // No valid constraints assumes we must require a super admin only
            kccUserGroupAuthData.debugInfo["routeRequiredSuperAdminOnly"] = true;

            // Super admin was checked near the beginning, so if this point is reached, they are not a super admin
            return false;
        }

        /** Planning just to check the situation where this is no org id specified */
        //todo: start here

        // Check for an app constraint
        if (constraints.app) {
            const appPermissions = userGroups.applications[constraints.app]?.[UserGroupPermissionKey];

            // // Check if user has
            // for (const appPermission of appPermissions) {
            //
            // }

        }


        /**
         * Require Admin logic (user must have at least one of the listed permissions)
         *  - org_id in request:
         *      - darksaber-admin
         *      - organizations/<oid>/admin
         *  - app_id in request:
         *      - darksaber-admin
         *      - applications/<aid>/app-admin
         *  - org_id and app_id in request:
         *      - darksaber-admin
         *      - applications/<aid>/app-admin
         *      - applications/<aid>/<oid>/admin   AND organizations/<oid>/*
         */

        /**
         * Now you have access to the following variables:
         *      body.keycloak.ga.appId    (string or null)   // The validated application id
         *      body.keycloak.ga.orgId    (string or null)   // The validated organization id
         *      body.keycloak.ga.groups   (string[] or null) // The group (or all groups) that matched this rule
         *      body.keycloak.ga.debugInfo                   // An object to help describe the logic behind the request (for code dev)
         *      body.keycloak.userInfo    (object from KC) **already a part of base library
         */

        //todo: finish building
        return false;
    }

    private inheritanceTreePermissions(inheritanceTree: InheritanceTree | undefined): Record<string, Set<string>> {
        // Check for no inheritance tree
        if (inheritanceTree === undefined) return {};

        // Check if the inheritance tree is the same as the one tied to this class
        if (this.treePermissions && this.groupAuthConfig.inheritanceTree === inheritanceTree) return this.treePermissions;

        const treePermissions: Record<string, Set<string>> = {};

        function dfs(permission: string, visitedNodes: Set<string>) {
            // // Check if this permission was visited already
            // if (treePermissions[permission]) return;

            // Add this permission to the tree
            treePermissions[permission] ??= new Set<string>([permission]);

            // Add this node to the tracker
            visitedNodes.add(permission);

            // Loop over the children of this permission
            for (const child of inheritanceTree?.[permission] ?? []) {
                // // Check if the child permission was visited already
                // if (treePermissions[child]) continue;

                // Check if the child permission was visited already
                if (!visitedNodes.has(child)) dfs(child, visitedNodes);

                // Add each of the children permissions to this node's permission list
                treePermissions[child]!.forEach(childPermission => treePermissions[permission]!.add(childPermission));
            }
        }

        for (const permission in inheritanceTree) {
            //todo: make this more efficient so we're not vising the same nodes over and over again
            dfs(permission, new Set());
        }


        return treePermissions;
    }

    // private checkPermission = (
    //     userPermission: string,
    //     requiredPermission: string,
    //     inheritanceTree: InheritanceTree | undefined
    // ) => this.checkPermissionRecursive(userPermission, requiredPermission, inheritanceTree, new Set());
    //
    // private checkPermissionRecursive = (
    //     userPermission: string,
    //     requiredPermission: string,
    //     inheritanceTree: InheritanceTree | undefined,
    //     checkedPermissions: Set<string>
    // ) => {
    //
    //     // Quick check if the permission matches the group
    //     if (userPermission === requiredPermission) return true;
    //
    //     // Add this checked permission
    //     checkedPermissions.add(userPermission);
    //
    //     // Check if no inheritance tree matching this permission
    //     const inheritedPermissions = inheritanceTree?.[userPermission];
    //     if (inheritedPermissions === undefined) return false;
    //
    //     // Check for a permission that grants all
    //     if (inheritedPermissions === "*") return true;
    //
    //     // Recurse the inheritance tree to find a match
    //     for (const inheritedPermission of inheritedPermissions) {
    //
    //         // Check if this permission was already checked
    //         if (checkedPermissions.has(userPermission)) continue;
    //
    //         // Recursively check this permission
    //         if (this.checkPermission(inheritedPermission, requiredPermission, inheritanceTree, checkedPermissions)) {
    //             return true;
    //         }
    //     }
    //
    //     // No match found
    //     return false;
    //
    // }

    exposedEndpoints = () => ({
        check: this.groupCheck,
    });

    groupAuth = () => {

    }

    groupCheck = () => {

    }

}
