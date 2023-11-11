import type {
    ClientRole,
    CombinedRoleRules,
    KcAccessJWT,
    KeycloakRole,
    RequiredRoles,
    RoleLocation,
    RoleRules
} from "../types.js";
import {
    ClientSearch,
    RoleConfigurationStyle,
    RoleLocations
} from "../types.js";
import type {Logger} from "pino";

const childRoleConfigurationStyles = [RoleConfigurationStyle.RoleLocation, RoleConfigurationStyle.ClientRole, RoleConfigurationStyle.RoleRules];
const roleLocations = Object.values(RoleLocations) as string[];

interface RoleHelperConfig {
    defaultResourceAccessKey: string;
    caseSensitiveRoleCheck?: boolean | undefined;
    pinoLogger?: Logger | undefined;
}

export class RoleHelper {
    private readonly config: RoleHelperConfig;

    public constructor(config: RoleHelperConfig) {
        this.config = config;
    }

    private arrayHasOnlyStrings = (array: Array<unknown>) => array.every(item => typeof item === "string");

    /**
     * Checks if this roles array contains only string|array<string> (i.e. RoleRules type)
     * @param roles
     */
    private isRoleRules = (roles: Array<unknown>): roles is RoleRules => roles.every(role => (
        typeof role === "string" ||
        (Array.isArray(role) && this.arrayHasOnlyStrings(role))
    ));


    public userHasRoles = (roles: RequiredRoles, validatedAccessToken: KcAccessJWT) => this.userHasRolesRecurse(roles, validatedAccessToken, true);

    private userHasRolesRecurse = (roles: RequiredRoles, validatedAccessToken: KcAccessJWT, topLevel = false): boolean => {

        // Determine the role configuration style
        const roleConfigStyle = this.determineRoleConfigStyle(roles);

        switch(roleConfigStyle) {
            case RoleConfigurationStyle.RoleRules: {
                // Assert the roles type
                const roleRules = roles as RoleRules;

                return this.userHasRoleRule(roleRules, validatedAccessToken, ClientSearch.RESOURCE_ACCESS);
            }
            case RoleConfigurationStyle.ClientRole: {
                // Assert the roles type
                const clientRoles = roles as ClientRole;

                // Ensure the user has role for each specified client
                return Object.entries(clientRoles).every(([client, role]) => {
                    return this.userHasRoleRule(role, validatedAccessToken, client);
                });
            }
            case RoleConfigurationStyle.RoleLocation: {
                // Assert the roles type
                const roleLocations = roles as RoleLocation;

                // Ensure there is a realm OR resource access
                if (roleLocations[RoleLocations.REALM_ACCESS] === undefined && roleLocations[RoleLocations.RESOURCE_ACCESS] === undefined)
                    throw new Error("Invalid role location configuration. Cannot process role rules.");

                // Check if the user either has the required REALM roles and required CLIENT roles
                const hasRealmAccess = this.userHasRoleRule(roleLocations[RoleLocations.REALM_ACCESS], validatedAccessToken, ClientSearch.REALM);
                const hasResourceAccess = (roleLocations[RoleLocations.RESOURCE_ACCESS] !== undefined && this.userHasRolesRecurse(roleLocations[RoleLocations.RESOURCE_ACCESS], validatedAccessToken));

                return ((roleLocations[RoleLocations.REALM_ACCESS] === undefined || hasRealmAccess)
                    && (roleLocations[RoleLocations.RESOURCE_ACCESS] === undefined || hasResourceAccess));
            }
            case RoleConfigurationStyle.CombinedRoleRulesArray: {
                // Assert the roles type
                const combinedRoleRules = roles as Array<CombinedRoleRules<never, never>>;

                // Check to see if we are not top level
                if (!topLevel) throw new Error("A combined role rules array must be at the top-level. Invalid role configuration.");

                // Check if any one of the combined role rules matches
                return combinedRoleRules.some(rule => this.userHasRolesRecurse(rule, validatedAccessToken));
            }
        }
    };

    private userHasRoleRule = (roleRules: RoleRules|undefined, validatedAccessToken: KcAccessJWT, client: ClientSearch | string): boolean => {
        // Check for an undefined role
        if (roleRules === undefined) return false;

        // Check for an empty role requirement
        if (roleRules.length === 0) return false;

        // Loop through each role rule (must have at least one matching role rule)
        for (let roleRule of roleRules) {
            // Wrap lone role rules
            if (typeof roleRule === "string") roleRule = [roleRule];

            // Must match every role in this role rule
            const roleRuleCheck = roleRule.every(role => this.userHasRole(role, validatedAccessToken, client));

            // If this role rule checks good, return now
            if (roleRuleCheck) return true;
        }

        // Failed to match role rules
        return false;
    };

    private userHasRole = (role: KeycloakRole, validatedAccessToken: KcAccessJWT, client: ClientSearch | string): boolean => {

        // Check for a REALM search
        if (client === ClientSearch.REALM) {
            // Check if the role is included in the realm roles
            return this.roleArrayHasRole(role, validatedAccessToken.realm_access?.roles);
        }

        // Grab the client id
        const clientId = (client === ClientSearch.RESOURCE_ACCESS) ? this.config.defaultResourceAccessKey : client;

        // Check for any roles
        if (validatedAccessToken.resource_access?.[clientId]?.roles === undefined) return false;

        // Check if the role is included in the client roles
        return this.roleArrayHasRole(role, validatedAccessToken.resource_access?.[clientId]?.roles)
    }

    private roleArrayHasRole = (roleToFind: string, roleArray: string[] | undefined): boolean => {
        // Check for no roles
        if (roleArray === undefined) return false;

        return (this.config.caseSensitiveRoleCheck) ?
            roleArray.some(role => role.localeCompare(roleToFind) === 0) :
            roleArray.some(role => role.localeCompare(roleToFind, undefined, {sensitivity: 'base'}) === 0);
    }

    private determineRoleConfigStyle = (roles: RequiredRoles): RoleConfigurationStyle => {

        // Determine the role configuration style
        if (Array.isArray(roles)) {
            // Check if style is RoleRules
            if (this.isRoleRules(roles)) return RoleConfigurationStyle.RoleRules;

            // Ensure each element of the array is either a RoleRules, RoleLocation, or ClientRole
            const isCombinedRoleRules = roles.every(role => {
                const roleStyle = this.determineRoleConfigStyle(role);
                return childRoleConfigurationStyles.includes(roleStyle);
            });

            if (isCombinedRoleRules) {
                return RoleConfigurationStyle.CombinedRoleRulesArray;
            }

        } else if (typeof roles === "object" && roles !== null) {

            // Grab the object's keys
            const objectKeys = Object.keys(roles);

            // Ensure the object has some keys
            if (objectKeys.length === 0) {
                this.config.pinoLogger?.error("No keys provided for role object, cannot process: ");
                this.config.pinoLogger?.error(roles);
                throw new Error("No keys provided for role object, cannot process.");
            }

            // Check if every key in the object is a RoleLocation
            if (objectKeys.every(item => roleLocations.includes(item))) {
                return RoleConfigurationStyle.RoleLocation;

                // Check if every key in the object is NOT a RoleLocation
            } else if (objectKeys.every(item => !roleLocations.includes(item))) {
                // Object must be shorthand client_ids such that the type of ClientRole
                return RoleConfigurationStyle.ClientRole;
            }
        }

        this.config.pinoLogger?.error(`Failed to match input style to expected type: (${typeof roles})`, roles);
        throw new Error("Invalid required roles, could not match input style to expected type");
    }
}
