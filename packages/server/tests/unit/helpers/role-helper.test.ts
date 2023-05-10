// jest.useFakeTimers();
import {describe, expect, test} from '@jest/globals';

import {RoleHelper} from "../../../src/helpers/role-helper.js";
import * as jose from 'jose'
import {RoleLocations} from "./../../../src/types.js";

describe('Validate role requirement calculation', () => {
    test('Tests full requirement', async () => {
        const roleHelper = new RoleHelper("my_client_id");
        const roles = [
            {
                [RoleLocations.REALM_ACCESS]: ['LIFT', 'EAT', ['LEAVE', 'LIGHTS', 'ON']],
            }
        ];
        const accessToken = "";

        const secret = new TextEncoder().encode(
            'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2',
        );
        const alg = 'HS256';
        const jwt = await new jose.SignJWT({
            resource_access: {
                roles: ['sup', 'dawg']
            }
        })
            .setProtectedHeader({ alg })
            .setIssuedAt()
            .setIssuer('urn:example:issuer')
            .setAudience('urn:example:audience')
            .setExpirationTime('2h')
            .sign(secret);

        // @ts-ignore
        expect(roleHelper.userHasRoles(roles, jwt)).toStrictEqual(false);
    });
});