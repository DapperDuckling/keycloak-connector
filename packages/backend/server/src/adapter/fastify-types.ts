import {FastifyPluginAsync as OriginalFastifyPluginAsync, FastifyRegister as OriginalFastifyRegister} from 'fastify';
import type {KeycloakConnectorExposedProperties, UserData} from "../types.js";
import {KeycloakRouteConfig} from "../types.js";


declare module 'fastify' {

    interface FastifyRequest {
        kccUserData: UserData;
        kccBypass: boolean;
        [key: string]: unknown;
        // routeConfig: KeycloakRouteConfigOrRoles;
    }

    interface FastifyInstance {
        kcc: KeycloakConnectorExposedProperties
    }

    interface RouteShorthandOptions {
        // routeConfig?: KeycloakRouteConfigOrRoles;
    }

    // interface FastifyRegister extends OriginalFastifyRegister<UserData> {}

    // // type ContextConfigDefault = KeycloakRouteConfig;
    // interface FastifyRequestContext {
    //     sup: boolean;
    // }
    // interface ContextConfigDefault extends KeycloakRouteConfig {}
}

export type KeycloakRouteConfigFastify = KeycloakRouteConfig & {
    bypassAllChecks?: boolean;
}

// interface KeycloakConnectorFastifyPlugin extends OriginalFastifyPluginAsync<KeycloakConnectorConfigCustom> {}
//
// // fastify-plugin automatically adds named export, so be sure to add also this type
// // the variable name is derived from `options.name` property if `module.exports.myPlugin` is missing
// export const keycloakConnectorFastifyPlugin: FastifyRegister<UserData>;
//
// // fastify-plugin automatically adds `.default` property to the exported plugin. See the note below
// export default keycloakConnectorFastifyPlugin;
