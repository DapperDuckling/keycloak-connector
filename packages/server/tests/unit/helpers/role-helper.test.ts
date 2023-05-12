import {beforeAll, beforeEach, jest} from '@jest/globals';
jest.useFakeTimers();

import {describe, expect, test} from '@jest/globals';


import {RoleHelper} from "../../../src/helpers/role-helper.js";
import type {RoleRules} from "./../../../src/types.js";
import {generateTestAccessToken} from "./generators.js";
import {faker} from "@faker-js/faker";
import {RoleConfigurationStyle} from "./../../../src/types.js";

describe('Validate role requirement calculation', () => {

    let roleHelper: RoleHelper;

    beforeEach(() => {
        roleHelper = new RoleHelper(faker.word.noun());
    });

    describe('Test RoleRules style input', () => {
        test('Singular RoleRule item passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('All RoleRule items passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('No RoleRule items passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('RoleRule array of roles passing', async () => {
            const roles: RoleRules<TestRoles> = [[TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER, TestRoles.BUG_CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('RoleRule array of roles with one role missing, thus failing', async () => {
            const roles: RoleRules<TestRoles> = [[TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('RoleRule array of roles with all roles missing, thus failing', async () => {
            const roles: RoleRules<TestRoles> = [[TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });

        test('Combined array & non-array roles, array role passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.CATCHER, TestRoles.BUG_CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('Combined array & non-array roles, non-array role passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test('Combined array & non-array roles, both passing', async () => {
            const roles: RoleRules<TestRoles> = [TestRoles.BATTER, [TestRoles.CATCHER, TestRoles.BUG_CATCHER]];
            const accessToken = await generateTestAccessToken({
                [roleHelper['defaultResourceAccessKey']]: [TestRoles.BASIC_USER, TestRoles.BATTER, TestRoles.CATCHER, TestRoles.BUG_CATCHER]
            });
            expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(true);
        });

        test.todo('Combined array & non-array roles, both failing');
    });

    describe('Test ClientRole style input', () => {
        test.todo('Singular client passing');
        test.todo('Singular client failing');
        test.todo('Multiple clients, all passing');
        test.todo('Multiple clients, single failing');
        test.todo('Multiple clients, multiple failing');
    });

    describe('Test RoleLocation style input', () => {
        test.todo('With realm_access & multiple resource_access rules');
        test.todo('With realm_access & singular resource_access rules');
        test.todo('With only realm_access rules');
        test.todo('With a single resource_access rule');
        test.todo('With multiple resource_access rules');
    });

    describe('Test array of CombinedRoleRules style input', () => {
        test.todo('Multiple CombinedRoleRules input with only one required rule matching');
        test.todo('Multiple CombinedRoleRules input with no required rule matching');
        test.todo('Multiple CombinedRoleRules input with all required rules matching');
    });

    describe('Test singular CombinedRoleRules style input', () => {
        // Todo: Are these necessary?
        test.todo('Single passing RoleRule');
        test.todo('Single failing RoleRule');
        test.todo('Single passing ClientRole');
        test.todo('Single failing ClientRole');
        test.todo('Single passing RoleLocation');
        test.todo('Single failing RoleLocation');
    });


    // test('Tests full requirement', async () => {
    //     const roleHelper = new RoleHelper("my_client_id");
    //     const roles = [
    //         {
    //             [RoleLocations.REALM_ACCESS]: ['LIFT', 'EAT', ['LEAVE', 'LIGHTS', 'ON']],
    //         }
    //     ];
    //     const accessToken = "";
    //
    //     const secret = new TextEncoder().encode(
    //         'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2',
    //     );
    //     const alg = 'HS256';
    //     const jwt = await new jose.SignJWT({
    //         resource_access: {
    //             roles: ['sup', 'dawg']
    //         }
    //     })
    //         .setProtectedHeader({ alg })
    //         .setIssuedAt()
    //         .setIssuer('urn:example:issuer')
    //         .setAudience('urn:example:audience')
    //         .setExpirationTime('2h')
    //         .sign(secret);
    //
    //     // @ts-ignore
    //     expect(roleHelper.userHasRoles(roles, jwt)).toStrictEqual(false);
    // });
});

enum TestRoles {
    BASIC_USER = "BASIC_USER",
    POWER_USER = "POWER_USER",
    OFFICE_MANAGER = "OFFICE_MANAGER",
    TREE_TASTER = "TREE_TASTER",
    JELLY_FISHER = "JELLY_FISHER",
    BATTER = "BATTER",
    PITCHER = "PITCHER",
    CATCHER = "CATCHER",
    SUNGLASSES_WEARER = "SUNGLASSES_WEARER",
    WALLET_USER = "WALLET_USER",
    ORANGE_EATER = "ORANGE_EATER",
    TISSUE_CLEANER = "TISSUE_CLEANER",
    CHAIR_ROCKER = "CHAIR_ROCKER",
    MUSIC_LISTENER = "MUSIC_LISTENER",
    CODE_WRITER = "CODE_WRITER",
    ALBUM_SELLER = "ALBUM_SELLER",
    HUSTLER = "HUSTLER",
    BAG_FLIPPER = "BAG_FLIPPER",
    BAG_TUMBLER = "BAG_TUMBLER",
    SOUNDCLOUD_PRODUCER = "SOUNDCLOUD_PRODUCER",
    VIDEO_WATCHER = "VIDEO_WATCHER",
    GRAPE_SQUEEZER = "GRAPE_SQUEEZER",
    DISHES_WASHER = "DISHES_WASHER",
    DOOR_OPERATOR = "DOOR_OPERATOR",
    FORKLIFT_OPERATOR = "FORKLIFT_OPERATOR",
    TV_OPERATOR = "TV_OPERATOR",
    SPA_SITTER = "SPA_SITTER",
    APPLICATION_CRASHER = "APPLICATION_CRASHER",
    BUG_REPORTER = "BUG_REPORTER",
    BUG_CATCHER = "BUG_CATCHER",
    BUG_SAMPLER = "BUG_SAMPLER",
}