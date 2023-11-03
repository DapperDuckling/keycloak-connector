import {type GroupRegexHandlers, UserGroupPermissionKey, type UserGroups} from "./types.js";

const groupRegexHandlers: GroupRegexHandlers = new Map();

// Add handler for "application" groups
groupRegexHandlers.set(
    /^\/applications\/(?<appId>[^\/]+)(?:\/(?<orgId>[^\/]+))?\/(?<permission>[^\/]+)$/,
    (userGroups, matchGroups) => {
        // Sanity check
        if (matchGroups["appId"] === undefined || matchGroups["permission"] === undefined) return;

        const appId = matchGroups["appId"];
        const permission = matchGroups["permission"];
        const orgId = matchGroups["orgId"];

        // Start the application id object
        userGroups.applications[appId] ??= {
            [UserGroupPermissionKey]: new Set(),
        }

        // Assume the target is the app-level group permission
        let target = userGroups.applications[appId]![UserGroupPermissionKey];

        // Check for an org id
        if (orgId !== undefined) {
            userGroups.applications[appId]![orgId] ??= new Set();
            target = userGroups.applications[appId]![orgId]!;
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

export const getUserGroups = (allUserGroups: string[]): UserGroups => {

    const userGroups = {
        applications: {},
        organizations: {},
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
