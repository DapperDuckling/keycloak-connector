import {FastifyRegister} from 'fastify';
import {ContextConfigDefault} from "fastify/types/utils.js";
import type {CombinedRoleRules, UserData} from "../types.js";
import type {KeycloakRequest} from "./fastify-adapter.js";

// Most importantly, use declaration merging to add the custom property to the Fastify type system
declare module 'fastify' {

    interface FastifyRequest extends KeycloakRequest {
        keycloak: UserData
    }

    interface FastifyInstance {
        lock: (roleRules: CombinedRoleRules[]) => ContextConfigDefault,
    }
}

// fastify-plugin automatically adds named export, so be sure to add also this type
// the variable name is derived from `options.name` property if `module.exports.myPlugin` is missing
export const keycloakConnectorFastifyPlugin: FastifyRegister<UserData>

// fastify-plugin automatically adds `.default` property to the exported plugin. See the note below
export default keycloakConnectorFastifyPlugin;