import type {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {KeycloakRouteConfig, UserData} from "keycloak-connector-server";
import type {GroupAuth, GroupAuthConfig, GroupAuthData} from "../types.js";
import type {FastifyInstance, FastifyRegister, FastifyRequest, FastifyRequest as OriginalFastifyRequest} from "fastify";
import {KeycloakRouteConfigOrRoles} from "keycloak-connector-server";

// Most importantly, use declaration merging to add the custom property to the Fastify type system
declare module 'fastify' {

    interface FastifyRequest {
        kccGroupAuthData: GroupAuthData;
        kccGroupAuthRouteConfig: GroupAuth;
    }

    interface FastifyInstance {
        kccGroupAuth: ReturnType<GroupAuthPlugin['exposedEndpoints']>;
    }

    interface RouteShorthandOptions {
        kccGroupAuthRouteConfig?: GroupAuth;
    }
}

// fastify-plugin automatically adds named export, so be sure to add also this type
// the variable name is derived from `options.name` property if `module.exports.myPlugin` is missing
export const groupAuthFastifyPlugin: FastifyRegister<GroupAuthData>;

// fastify-plugin automatically adds `.default` property to the exported plugin. See the note below
export default groupAuthFastifyPlugin;
