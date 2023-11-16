// sum.test.js
import { expect, test, describe, beforeEach } from 'vitest'
import {faker} from "@faker-js/faker";
import type {GroupAuth, GroupAuthDebug, GroupAuthDebugPrintable} from "../../src/index.js";
import {type GroupAuthConfig, GroupAuthPlugin} from "../../src/index.js";
import type {ConnectorRequest, UserData} from "@dapperduckling/keycloak-connector-server";
import type {GroupAuthFunc} from "../../src/group-auth-builder.js";
import {groupAuth} from "../../src/group-auth-builder.js";
import {GroupPathBuilder} from "./group-path-builder.js";
import * as url from "url";

// Uncomment to debug a particular seed
// process.env["seed"] = "<SEED ID HERE>";

// Set the seed if given one
if (process.env["seed"]) faker.seed(Number.parseInt(process.env["seed"]));


describe('Validate GroupAuth configuration to actual permission group requirement', () => {

    let groupAuthPlugin: GroupAuthPlugin;
    let connectorRequest: ConnectorRequest;
    let userData: UserData;
    let groupAuthDebug: GroupAuthDebug;
    let groupPathBuilder: GroupPathBuilder;

    beforeEach(() => {
        groupAuthPlugin = new GroupAuthPlugin({
            app: "SPECIFIC-APP",
        });

        connectorRequest = {
            cookies: {},
            routeConfig: {},
            urlQuery: {},
            url: "",
            urlParams: {},
            headers: {}
        }

        userData = {
            isAuthenticated: false,
            isAuthorized: false
        };
        groupAuthDebug = {};

        groupPathBuilder = new GroupPathBuilder(groupAuthPlugin);

    });

    // Helper function to build the required group auth parameters to inject into the group auth class functions
    const groupAuthSingle = (...args: Parameters<GroupAuthFunc>): [GroupAuthConfig, GroupAuth] => {
        const groupAuthSetup = groupAuth(...args).groupAuths?.[0] ?? {};
        return [
            {
                ...groupAuthPlugin['groupAuthConfig'],
                ...groupAuthSetup.config
            },
            groupAuthSetup
        ];
    }

    function compare(
        matchingGroups: GroupAuthDebugPrintable['matchingGroups'],
        expectedMatchingGroups: GroupAuthDebugPrintable['matchingGroups']
    ) {
        // Sort the arrays
        matchingGroups.appRequirements.sort();
        matchingGroups.orgRequirements.sort();
        expectedMatchingGroups.appRequirements.sort();
        matchingGroups.orgRequirements.sort();

        console.log(`Expected`, expectedMatchingGroups);
        console.log(`Actual`, matchingGroups);
        expect(matchingGroups).toEqual(expectedMatchingGroups);
    }

    function enableAppParam(groupAuthConfig: GroupAuthConfig) {
        if (groupAuthConfig.appParam === undefined) throw new Error('Cannot set app param value when no app param/token is set in config');
        connectorRequest.urlParams[groupAuthConfig.appParam] = "<USELESS_VALUE>";
    }

    function enableOrgParam(groupAuthConfig: GroupAuthConfig) {
        if (groupAuthConfig.orgParam === undefined) throw new Error('Cannot set org param value when no app param/token is set in config');
        connectorRequest.urlParams[groupAuthConfig.orgParam] = "<USELESS_VALUE>";
    }

    describe('Test basic group auth config', () => {
        test('No params & empty configuration', async () => {

            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle();

            // Grab the matching groups
            await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // Build the expected groups
            const expectedMatchingGroups = groupPathBuilder
                .setGroupAuthConfig(groupAuthConfig)
                .defaultAdmins()
                .appParamValueIsSet()
                .app("admin", "MATCHING")
                .app("user", "MATCHING")
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });

        test('App param & empty configuration', async () => {

            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle();

            enableAppParam(groupAuthConfig);

            // Grab the matching groups
            await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // Build the expected groups
            const expectedMatchingGroups = groupPathBuilder
                .setGroupAuthConfig(groupAuthConfig)
                .appParamValueIsSet()
                .defaultAdmins()
                .app("admin", "MATCHING")
                .app("user", "MATCHING")
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });

        test('Org param & empty configuration', async () => {

            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle();

            enableOrgParam(groupAuthConfig);

            // Grab the matching groups
            await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // Build the expected groups
            const expectedMatchingGroups = groupPathBuilder
                .setGroupAuthConfig(groupAuthConfig)
                .defaultAdmins()
                .app("admin")
                .app("user")
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });

        test('App & org param & empty configuration', async () => {

            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle();

            enableAppParam(groupAuthConfig);
            enableOrgParam(groupAuthConfig);

            // Grab the matching groups
            await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // Build the expected groups
            const expectedMatchingGroups = groupPathBuilder
                .setGroupAuthConfig(groupAuthConfig)
                .defaultAdmins()
                .app("admin")
                .app("user")
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });

        test('Requires random_permission', async () => {
            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle("random_permission");

            // Grab the matching groups
            await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // Build the expected groups
            const expectedMatchingGroups = groupPathBuilder
                .setGroupAuthConfig(groupAuthConfig)
                .defaultAdmins()
                .app("admin", "MATCHING")
                .app("random_permission", "MATCHING")
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });

        describe('noImplicitApp and require "admin" permission', async () => {
            let groupAuthConfig: GroupAuthConfig;
            let groupAuthSetup: GroupAuth;

            beforeEach(() => {
                // Build the necessary input parameters
                [groupAuthConfig, groupAuthSetup] = groupAuthSingle("admin", {
                    noImplicitApp: true,
                });
            });

            test('Org and app param -- Users with the "admin" permission for a specific org & app AND have associated access in specific org', async () => {
                enableOrgParam(groupAuthConfig);
                enableAppParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .allOrgAdmin()
                    .app("admin")
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('App param -- Users with the "admin" permission for a specific app (any org)', async () => {
                enableAppParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .allOrgAdmin()
                    .app("admin", "MATCHING")
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            // test('Org param included - All org admin & org admin for org specified', async () => {
            //     enableOrgParam(groupAuthConfig);
            //
            //     // Grab the matching groups
            //     await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            //     const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;
            //
            //     // Build the expected groups
            //     const expectedMatchingGroups = groupPathBuilder
            //         .setGroupAuthConfig(groupAuthConfig)
            //         .systemAdmin()
            //         .allOrgAdmin()
            //         .org()
            //         .output();
            //
            //     // Compare
            //     compare(matchingGroups, expectedMatchingGroups);
            // });
            //
            // test('App param included - Any org admin can access', async () => {
            //     enableAppParam(groupAuthConfig);
            //
            //     // Grab the matching groups
            //     await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            //     const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;
            //
            //     // Build the expected groups
            //     const expectedMatchingGroups = groupPathBuilder
            //         .setGroupAuthConfig(groupAuthConfig)
            //         .systemAdmin()
            //         .allOrgAdmin()
            //         .anyOrg()
            //         .output();
            //
            //     // Compare
            //     compare(matchingGroups, expectedMatchingGroups);
            // });
            //
            // test('App & org param included - All org admin & org admin for org specified', async () => { //todo:
            //     enableAppParam(groupAuthConfig);
            //     enableOrgParam(groupAuthConfig);
            //
            //     // Grab the matching groups
            //     await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            //     const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;
            //
            //     // Build the expected groups
            //     const expectedMatchingGroups = groupPathBuilder
            //         .setGroupAuthConfig(groupAuthConfig)
            //         .systemAdmin()
            //         .allOrgAdmin()
            //         .org()
            //         .output();
            //
            //     // Compare
            //     compare(matchingGroups, expectedMatchingGroups);
            // });
        });
        describe('ORG_ADMINS_ONLY set with noImplicitApp', async () => {
            let groupAuthConfig: GroupAuthConfig;
            let groupAuthSetup: GroupAuth;

            beforeEach(() => {
                // Build the necessary input parameters
                [groupAuthConfig, groupAuthSetup] = groupAuthSingle({
                    noImplicitApp: true,
                    requireAdmin: "ORG_ADMINS_ONLY",
                });
            });

            test('No org param - Any org admin can access', async () => {
                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allOrgAdmin()
                    .anyOrg()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('Org param included - All org admin & org admin for org specified', async () => {
                enableOrgParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allOrgAdmin()
                    .org()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('App param included - Any org admin can access', async () => {
                enableAppParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allOrgAdmin()
                    .anyOrg()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('App & org param included - All org admin & org admin for org specified', async () => { //todo:
                enableAppParam(groupAuthConfig);
                enableOrgParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allOrgAdmin()
                    .org()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });
        });
        describe('APP_ADMINS_ONLY set with noImplicitApp', async () => {
            let groupAuthConfig: GroupAuthConfig;
            let groupAuthSetup: GroupAuth;

            beforeEach(() => {
                // Build the necessary input parameters
                [groupAuthConfig, groupAuthSetup] = groupAuthSingle({
                    noImplicitApp: true,
                    requireAdmin: "APP_ADMINS_ONLY",
                });
            });

            test('No app param - Any app admin can access', async () => {
                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .anyApp()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('App param included - All app admin & app admin for app specified', async () => {
                enableAppParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .app()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('Org param included - Any app admin can access', async () => {
                enableOrgParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .anyApp()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('App & org param included - All app admin & app admin for org specified', async () => { //todo:
                enableAppParam(groupAuthConfig);
                enableOrgParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .app()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });
        });
        describe('APP_ADMINS_ONLY & STANDALONE set with noImplicitApp', async () => {
            let groupAuthConfig: GroupAuthConfig;
            let groupAuthSetup: GroupAuth;

            beforeEach(() => {
                // Build the necessary input parameters
                [groupAuthConfig, groupAuthSetup] = groupAuthSingle({
                    noImplicitApp: true,
                    requireAdmin: "APP_ADMINS_ONLY",
                    appIsStandalone: true,
                });
            });

            test('No app param - Any standalone admin can access', async () => {
                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .anyStandalone()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('App param included - All app admin & standalone admin for app specified', async () => {
                enableAppParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .standalone()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('Org param included - Any standalone admin can access', async () => {
                enableOrgParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .anyStandalone()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });

            test('App & org param included - All app admin & standalone admin for org specified', async () => { //todo:
                enableAppParam(groupAuthConfig);
                enableOrgParam(groupAuthConfig);

                // Grab the matching groups
                await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
                const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

                // Build the expected groups
                const expectedMatchingGroups = groupPathBuilder
                    .setGroupAuthConfig(groupAuthConfig)
                    .systemAdmin()
                    .allAppAdmin()
                    .standalone()
                    .output();

                // Compare
                compare(matchingGroups, expectedMatchingGroups);
            });
        });

        test('Requires org admin through url inference', async () => {
            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle({
                noImplicitApp: true,
                requireAdmin: true,
            });

            enableOrgParam(groupAuthConfig);

            // Grab the matching groups
            await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // Build the expected groups
            const expectedMatchingGroups = groupPathBuilder
                .setGroupAuthConfig(groupAuthConfig)
                .systemAdmin()
                .allOrgAdmin()
                .org()
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });

        test('Requires app admin through url inference', async () => {
            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle({
                noImplicitApp: true,
                requireAdmin: true,
            });

            enableAppParam(groupAuthConfig);

            // Grab the matching groups
            await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // Build the expected groups
            const expectedMatchingGroups = groupPathBuilder
                .setGroupAuthConfig(groupAuthConfig)
                .systemAdmin()
                .allAppAdmin()
                .app()
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });

        test('Requires standalone admin through url inference', async () => {
            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle({
                noImplicitApp: true,
                requireAdmin: true,
                appIsStandalone: true,
            });

            enableAppParam(groupAuthConfig);

            // Grab the matching groups
            await groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // Build the expected groups
            const expectedMatchingGroups = groupPathBuilder
                .setGroupAuthConfig(groupAuthConfig)
                .systemAdmin()
                .allAppAdmin()
                .standalone()
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });
    });

});
