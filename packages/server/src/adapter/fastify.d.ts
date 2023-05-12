import {FastifyRegister} from 'fastify';
import {RouteGenericInterface} from "fastify/types/route.js";
import {
    ContextConfigDefault,
    RawRequestDefaultExpression,
    RawServerBase,
    RawServerDefault
} from "fastify/types/utils.js";
import {FastifySchema} from "fastify/types/schema.js";
import {
    FastifyRequestType,
    FastifyTypeProvider,
    FastifyTypeProviderDefault,
    ResolveFastifyRequestType
} from "fastify/types/type-provider.js";
import {FastifyBaseLogger} from "fastify/types/logger.js";
import type {UserData} from "../types.js";


// Most importantly, use declaration merging to add the custom property to the Fastify type system
declare module 'fastify' {
    interface FastifyRequest<RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
        RawServer extends RawServerBase = RawServerDefault,
        RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
        SchemaCompiler extends FastifySchema = FastifySchema,
        TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
        ContextConfig = ContextConfigDefault,
        Logger extends FastifyBaseLogger = FastifyBaseLogger,
        RequestType extends FastifyRequestType = ResolveFastifyRequestType<TypeProvider, SchemaCompiler, RouteGeneric>> {
        keycloak: UserData
    }
}

// fastify-plugin automatically adds named export, so be sure to add also this type
// the variable name is derived from `options.name` property if `module.exports.myPlugin` is missing
export const keycloakConnectorFastifyPlugin: FastifyRegister<UserData>

// fastify-plugin automatically adds `.default` property to the exported plugin. See the note below
export default keycloakConnectorFastifyPlugin;