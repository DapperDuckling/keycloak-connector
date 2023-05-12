import * as jose from "jose";

const TOKEN_ALGORITHM = "HS256";

const generateTestSecret = () => {
    const randomNumbers = Array.from({length: 64}, () => Math.floor(Math.random() * 256));
    return Uint8Array.from(randomNumbers);
}

const generateRolesAndToken = (clientId: string) => {

}

interface SimpleRolesPayload {
    _realm?: string[],
    [clientId: string]: string[]
}

const generateJWTPayload = (rolesPayload: SimpleRolesPayload) => {
    const generatedPayload: Record<string, any> = {};

    for (const [clientId, roles] of Object.entries(rolesPayload)) {
        // Check for a realm role
        if (clientId === "_realm") {
            generatedPayload['realm_access'] = {
                roles: roles
            }
            continue;
        }

        // Handle client roles
        generatedPayload['resource_access'] ??= {}
        generatedPayload['resource_access'][clientId] = {
            roles: roles
        }
    }

    return generatedPayload;
}

export const generateTestAccessToken = async (rolesPayload: SimpleRolesPayload) => {
    const secret = generateTestSecret();
    const payload = generateJWTPayload(rolesPayload);
    const jwt = await new jose.SignJWT(payload)
        .setProtectedHeader({alg: TOKEN_ALGORITHM})
        .setIssuedAt()
        .setIssuer('my-test-issuer')
        .setAudience('my-test-audience')
        .setExpirationTime('2h')
        .sign(secret);
    return jose.decodeJwt(jwt);
}