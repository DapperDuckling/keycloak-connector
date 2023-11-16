// sum.test.js
import { expect, test, describe, beforeEach } from 'vitest'
import {faker} from "@faker-js/faker";
import type {GroupAuth, GroupAuthDebug, GroupAuthDebugPrintable} from "../../src/index.js";
import {GroupAuthConfig, GroupAuthPlugin} from "../../src/index.js";
import type {ConnectorRequest, UserData} from "@dapperduckling/keycloak-connector-server";
import type {GroupAuthFunc} from "../../src/group-auth-builder.js";
import {groupAuth} from "../../src/group-auth-builder.js";
import {GroupPathBuilder} from "./group-path-builder.js";

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
            url: faker.internet.url(),
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

    const expectedMatchingGroups = ({orgRequirements, appRequirements}: { orgRequirements?: string[], appRequirements?: string[] }): GroupAuthDebugPrintable['matchingGroups'] => {
        const matchingGroups: GroupAuthDebugPrintable['matchingGroups'] = {
            appRequirements: [],
            orgRequirements: [],
        }

        return matchingGroups;
    }

    describe('Test basic group auth config', () => {
        test('Empty configuration', async () => {
            const [groupAuthConfig, groupAuthSetup] = groupAuthSingle();
            groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthSetup, groupAuthDebug);
            const matchingGroups = GroupAuthPlugin.groupAuthDebugToPrintable(groupAuthDebug).matchingGroups;

            // todo: Move to helper function
            const systemAdmin = groupAuthPlugin['groupAuthConfig'].adminGroups?.systemAdmin;
            const expectedMatchingGroups: GroupAuthDebugPrintable = {
                matchingGroups: {
                    ...systemAdmin && {systemAdmin: systemAdmin},
                    orgRequirements: ["/organizations/all-org-admin", "/organizations/<org_id>/*"],
                    appRequirements: [
                        "/applications/all-app-admin",
                        "/applications/<app_id>/app-admin",
                        "/applications/<app_id>/user",
                        "/applications/<app_id>/admin",
                        "/applications/<app_id>/<org_id>/user",
                        "/applications/<app_id>/<org_id>/admin"
                    ],
                }
            }

            const expectedMatchingGroups = groupPathBuilder.default();

            expect(matchingGroups).toEqual(expectedMatchingGroups);
        });
    });
});
