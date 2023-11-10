import {type GroupAuthConfig, type GroupRegexHandlers, UserGroupPermissionKey, type UserGroupsInternal} from "./types.js";
import {Narrow} from "./helpers/utils.js";

const groupRegexHandlers: GroupRegexHandlers = new Map();

// Add handler for "application" groups
groupRegexHandlers.set(
    /^\/(?<appType>applications|standalone)\/(?<appId>[^\/]+)(?:\/(?<orgId>[^\/]+))?\/(?<permission>[^\/]+)$/,
    (userGroups, matchGroups) => {
        // Sanity check (org id is optional here)
        if (matchGroups["appType"] === undefined ||
            matchGroups["appId"] === undefined ||
            matchGroups["permission"] === undefined) return;

        const appType = matchGroups["appType"] as "applications" | "standalone";
        const appId = matchGroups["appId"];
        const permission = matchGroups["permission"];
        const orgId = matchGroups["orgId"];

        // Grab a reference to the target app type
        const targetGroup = (appType === "standalone") ? userGroups["standalone"] : userGroups["applications"];

        // Start the application id object
        targetGroup[appId] ??= {
            [UserGroupPermissionKey]: new Set(),
        }

        // Help typescript. Grab the target app instead.
        const targetApp = targetGroup[appId]!;

        // Assume the target is the app-level group permission
        let target = targetApp[UserGroupPermissionKey];

        // Check for an invalid permission
        if (orgId !== undefined && appType === "standalone") {
            throw new Error(`Invalid group structure detected. Standalone app cannot have organization sub-group. App: ${appId}, OrgId: ${orgId}`);
        }

        // Check for an org id
        if (orgId !== undefined && appType === "applications") {
            // Force typescript to narrow the scope
            Narrow<UserGroupsInternal['applications'][string]>(targetApp);

            // Start the organization permission set for this app
            targetApp[orgId] ??= new Set<string>();

            // Update the target
            target = targetApp[orgId]!;
        }

        // Add the permission
        target.add(permission);
    }
);

// Add handler for "organization" groups
groupRegexHandlers.set(
    /^\/organizations\/(?<orgId>[^\/]+)\/(?<permission>[^\/]+)$/,
    (userGroups, matchGroups) => {
        // Sanity check
        if (matchGroups["orgId"] === undefined || matchGroups["permission"] === undefined) return;

        const permission = matchGroups["permission"];
        const orgId = matchGroups["orgId"];

        // Start the application id object
        userGroups.organizations[orgId] ??= new Set();

        // Add the permission
        userGroups.organizations[orgId]!.add(permission);
    }
);

export const getUserGroups = (allUserGroups: string[], adminGroupsConfig: GroupAuthConfig['adminGroups']): UserGroupsInternal => {

    const userGroups: UserGroupsInternal = {
        isSystemAdmin: (adminGroupsConfig?.superAdmin && allUserGroups.includes(adminGroupsConfig.superAdmin)) === true,
        isAllAppAdmin: (adminGroupsConfig?.allAppAdmin && allUserGroups.includes(adminGroupsConfig.allAppAdmin)) === true,
        isAllOrgAdmin: (adminGroupsConfig?.allOrgAdmin && allUserGroups.includes(adminGroupsConfig.allOrgAdmin)) === true,
        applications: {},
        organizations: {},
        standalone: {},
    }

    // Loop through all the groups, execute the regex, and execute the resultant handler if there is a match
    for (const group of allUserGroups) {
        for (const [regex, handler] of groupRegexHandlers) {
            const matchGroups = regex.exec(group)?.groups;
            if (matchGroups === undefined) continue;

            // Execute the handler
            handler(userGroups, matchGroups);

            // Only execute the first handler for a given group
            break;
        }
    }

    return userGroups;
}
