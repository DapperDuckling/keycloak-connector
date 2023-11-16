// sum.test.js
import { expect, test } from 'vitest'

export function sum(a: number, b: number) {
    return a + b
}

test('adds 1 + 2 to equal 3', () => {
    expect(sum(1, 2)).toBe(3)
});

// Uncomment to debug a particular seed
// process.env["seed"] = "<SEED ID HERE>";

// // Set the seed if given one
// if (process.env["seed"]) faker.seed(Number.parseInt(process.env["seed"]));

// describe('Validate GroupAuth configuration to actual permission group requirement', () => {
//
//     let groupAuthPlugin: GroupAuthPlugin;
//     let connectorRequest: ConnectorRequest;
//     let userData: UserData;
//     let groupAuthDebug: GroupAuthDebug;
//
//     beforeEach(() => {
//         groupAuthPlugin = new GroupAuthPlugin({
//             app: faker.company.catchPhraseNoun(),
//         });
//
//         connectorRequest = {
//             cookies: {},
//             routeConfig: {},
//             urlQuery: {},
//             url: faker.internet.url(),
//             urlParams: {},
//             headers: {}
//         }
//
//         userData = {
//             isAuthenticated: false,
//             isAuthorized: false
//         };
//         groupAuthDebug = {};
//     });
//
//     describe('Test basic group auth config', () => {
//         test('Empty configuration', async () => {
//             const groupAuthConfig = groupAuthSingle();
//             groupAuthPlugin['isAuthorizedGroup'](connectorRequest, userData, groupAuthConfig, groupAuthDebug);
//             expect(false).toStrictEqual(true);
//             // debugger;
//             // expect(roleHelper['determineRoleConfigStyle'](roles)).toStrictEqual(RoleConfigurationStyle.RoleRules);
//             // expect(roleHelper.userHasRoles(roles, accessToken)).toStrictEqual(false);
//         });
//     });
// });
