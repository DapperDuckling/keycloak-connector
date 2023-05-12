import {beforeEach, describe, expect, test} from '@jest/globals';
import {RoleHelper} from "../../../src/helpers/role-helper.js";
import type {ClientRole, KeycloakClient, RequiredRoles, RoleLocation, RoleRules} from "./../../../src/types.js";
import {RoleConfigurationStyle, RoleLocations} from "./../../../src/types.js";
import {generateTestAccessToken, TestRoles} from "./generators.js";
import {faker} from "@faker-js/faker";

// Uncomment to debug a particular seed
// process.env["seed"] = "<SEED ID HERE>";

// Set the seed if given one
if (process.env["seed"]) faker.seed(Number.parseInt(process.env["seed"]));

describe('Validate role requirement calculation', () => {

    let roleHelper: RoleHelper;

    beforeEach(() => {
        roleHelper = new RoleHelper({defaultResourceAccessKey : faker.word.noun()});
    });

    describe('Test RoleRules style input', () => {
        test('Singular RoleRule item passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('All RoleRule items passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('No RoleRule items passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('RoleRule array of roles passing', async () => {
            const roles: RoleRules<TestRoles> = [[TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER, TestRoles.BUG_CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('RoleRule array of roles with one role missing, thus failing', async () => {
            const roles: RoleRules<TestRoles> = [[TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('RoleRule array of roles with all roles missing, thus failing', async () => {
            const roles: RoleRules<TestRoles> = [[TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('Combined array & non-array roles, array role passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER, TestRoles.BUG_CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('Combined array & non-array roles, non-array role passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('Combined array & non-array roles, both passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('Combined array & non-array roles, both failing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });
    });

    describe('Test ClientRole style input', () => {
        test('Singular client passing', async () => {
            const roles: ClientRole<KeycloakClient, TestRoles> = {
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
            };
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.ClientRole);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('Singular client failing', async () => {
            const roles: ClientRole<KeycloakClient, TestRoles> = {
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
            };
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.ClientRole);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('Multiple clients, all passing', async () => {
            const roles: ClientRole<KeycloakClient, TestRoles> = {
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                randomOtherClient: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
            };
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER],
                randomOtherClient: [TestRoles.BUG_CATCHER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.ClientRole);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('Multiple clients, single failing', async () => {
            const roles: ClientRole<KeycloakClient, TestRoles> = {
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                randomOtherClient: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
            };
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.ClientRole);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('Multiple clients, multiple failing', async () => {
            const roles: ClientRole<KeycloakClient, TestRoles> = {
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                randomOtherClient: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
            };
            const accessToken = await generateTestAccessToken({
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.ClientRole);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });
    });

    describe('Test RoleLocation style input', () => {
        test('With realm_access & multiple resource_access rules, passing', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
                [RoleLocations.RESOURCE_ACCESS]: {
                    [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                    randomOtherClient: [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]],
                }
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER],
                randomOtherClient: [TestRoles.BASIC_USER, TestRoles.BATTER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('With realm_access & multiple resource_access rules, failing realm check', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
                [RoleLocations.RESOURCE_ACCESS]: {
                    [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                    randomOtherClient: [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]],
                }
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER],
                randomOtherClient: [TestRoles.BASIC_USER, TestRoles.BATTER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('With realm_access & multiple resource_access rules, failing client check', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
                [RoleLocations.RESOURCE_ACCESS]: {
                    [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                    randomOtherClient: [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]],
                }
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('With realm_access & singular resource_access rules, passing', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
                [RoleLocations.RESOURCE_ACCESS]: {
                    [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                }
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('With only realm_access rules, passing', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('With only realm_access rules, failing', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                randomOtherClient: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('With a single resource_access rule, passing', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.RESOURCE_ACCESS]: {
                    [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                }
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('With a single resource_access rule, failing', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.RESOURCE_ACCESS]: {
                    [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                }
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER, TestRoles.CATCHER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER],
                randomOtherClient: [TestRoles.BASIC_USER, TestRoles.CATCHER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('With multiple resource_access rules, passing', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.RESOURCE_ACCESS]: {
                    [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                    randomOtherClient: [[TestRoles.BASIC_USER, TestRoles.CATCHER]],
                }
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER],
                randomOtherClient: [TestRoles.BASIC_USER, TestRoles.CATCHER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('With multiple resource_access rules, failing', async () => {
            const roles: RoleLocation<TestRoles> = {
                [RoleLocations.RESOURCE_ACCESS]: {
                    [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                    randomOtherClient: [[TestRoles.BASIC_USER, TestRoles.CATCHER]],
                }
            };
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleLocation);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });
    });

    describe('Test array of CombinedRoleRules style input', () => {
        test('Multiple CombinedRoleRules input with only the second required rule matching', async () => {
            const roles: RequiredRoles<TestRoles> = [
                {
                    [RoleLocations.RESOURCE_ACCESS]: {
                        [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                        randomOtherClient: [[TestRoles.CATCHER]],
                    }
                },
                {
                    [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
                },
            ];
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.CombinedRoleRulesArray);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('Multiple CombinedRoleRules input with no required rule matching', async () => {
            const roles: RequiredRoles<TestRoles> = [
                {
                    [RoleLocations.RESOURCE_ACCESS]: {
                        [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                        randomOtherClient: [[TestRoles.CATCHER]],
                    }
                },
                {
                    [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
                },
            ];
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER],
                randomOtherClient: [TestRoles.BASIC_USER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.CombinedRoleRulesArray);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('Multiple CombinedRoleRules input with all required rules matching', async () => {
            const roles: RequiredRoles<TestRoles> = [
                {
                    [RoleLocations.RESOURCE_ACCESS]: {
                        [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER],
                        randomOtherClient: [[TestRoles.CATCHER]],
                    }
                },
                {
                    [RoleLocations.REALM_ACCESS]: [[TestRoles.GRAPE_SQUEEZER, TestRoles.POWER_USER], TestRoles.SOUNDCLOUD_PRODUCER],
                },
            ];
            const accessToken = await generateTestAccessToken({
                _realm: [TestRoles.BASIC_USER, TestRoles.POWER_USER],
                [roleHelper['config']['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER],
                randomOtherClient: [TestRoles.BASIC_USER, TestRoles.CATCHER],
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.CombinedRoleRulesArray);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });
    });
});