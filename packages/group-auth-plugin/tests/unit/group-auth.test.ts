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
            app: faker.company.catchPhraseNoun(),
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
        test('Empty configuration', async () => {

            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle();

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
                .app("admin")
                .app("random_permission")
                .output();

            // Compare
            compare(matchingGroups, expectedMatchingGroups);
        });

        describe('Requires org admin explicitly with noImplicitApp', async () => {
            let groupAuthConfig: GroupAuthConfig;
            let groupAuthSetup: GroupAuth;

            beforeEach(() => {
                // Build the necessary input parameters
                [groupAuthConfig, groupAuthSetup] = groupAuthSingle({
                    noImplicitApp: true,
                    requireAdmin: "ORG_ADMIN_ONLY",
                });
            });

            test('No org param - Only all org admin can access', async () => {
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

            test('Org param included - Any org admin can access', async () => {
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

            test('App param included - Just all org admin can access', async () => {
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

            test('App & org param included - Any org admin can access', async () => { //todo:
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

        test('Requires org admin through url inference', async () => {
            // Build the necessary input parameters
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle({
                noImplicitApp: true,
                requireAdmin: true,
            });

            // enableAppParam(groupAuthConfig);
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
});
