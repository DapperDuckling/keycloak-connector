import * as jose from "jose";

const TOKEN_ALGORITHM = "HS256";

const generateTestSecret = () => {
    const randomNumbers = Array.from({length: 64}, () => Math.floor(Math.random() * 256));
    return Uint8Array.from(randomNumbers);
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

export enum TestRoles {
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