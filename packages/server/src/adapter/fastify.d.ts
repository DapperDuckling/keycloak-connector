import {FastifyRegister} from 'fastify';
import type {KeycloakRouteConfigOrRoles, UserData} from "../types.js";
import {KeycloakConnectorExposedProperties} from "../types.js";

declare module 'fastify' {
    interface FastifyRequest {
        kccUserData: UserData;
        // routeConfig: KeycloakRouteConfigOrRoles;
    }

    interface FastifyInstance {
        kcc: KeycloakConnectorExposedProperties
    }

    interface RouteShorthandOptions {
        // routeConfig?: KeycloakRouteConfigOrRoles;
    }
}

// fastify-plugin automatically adds named export, so be sure to add also this type
// the variable name is derived from `options.name` property if `module.exports.myPlugin` is missing
export const keycloakConnectorFastifyPlugin: FastifyRegister<UserData>;

// fastify-plugin automatically adds `.default` property to the exported plugin. See the note below
export default keycloakConnectorFastifyPlugin;
