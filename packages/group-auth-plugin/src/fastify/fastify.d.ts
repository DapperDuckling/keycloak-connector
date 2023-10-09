import type {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {KeycloakRequest, UserData} from "keycloak-connector-server";
import type {GroupAuthData} from "../types.js";
import type {FastifyRegister} from "fastify";

// Most importantly, use declaration merging to add the custom property to the Fastify type system
declare module 'fastify' {

    interface FastifyRequest extends KeycloakRequest {
        keycloak: GroupAuthUserData;
    }

    interface FastifyInstance {
        kccGroupAuth: GroupAuthPlugin['exposedEndpoints'];
    }
}

export interface GroupAuthUserData extends UserData {
    groupAuth: GroupAuthData
}

// fastify-plugin automatically adds named export, so be sure to add also this type
// the variable name is derived from `options.name` property if `module.exports.myPlugin` is missing
export const groupAuthFastifyPlugin: FastifyRegister<GroupAuthUserData>;

// fastify-plugin automatically adds `.default` property to the exported plugin. See the note below
export default groupAuthFastifyPlugin;