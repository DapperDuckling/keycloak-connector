// sum.test.js
import { expect, test } from 'vitest'
import {faker} from "@faker-js/faker";
import type {GroupAuthDebug} from "../../src/index.js";
import {GroupAuthPlugin} from "../../src/index.js";
import type {ConnectorRequest, UserData} from "@dapperduckling/keycloak-connector-server";
import type {GroupAuthFunc} from "../../src/group-auth-builder.js";
import {groupAuth} from "../../src/group-auth-builder.js";

// Uncomment to debug a particular seed
// process.env["seed"] = "<SEED ID HERE>";

// Set the seed if given one
if (process.env["seed"]) faker.seed(Number.parseInt(process.env["seed"]));

function groupAuthSingle(...args: Parameters<GroupAuthFunc>) {
    const groupAuthConfig = groupAuth(...args).groupAuths?.[0];
    if (groupAuthConfig === undefined) throw new Error("No group auth config found");
    return groupAuthConfig;
}

describe('Validate GroupAuth configuration to actual permission group requirement', () => {

    let groupAuthPlugin: GroupAuthPlugin;
    let connectorRequest: ConnectorRequest;
    let userData: UserData;
    let groupAuthDebug: GroupAuthDebug;

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
    });

    describe('Test basic group auth config', () => {
        test('Empty configuration', async () => {
            const groupAuthConfig = groupAuthSingle();
            groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthConfig, groupAuthDebug);
            expect(false).toStrictEqual(true);
            // debugger;
            // expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
            // expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
        });
    });
});
