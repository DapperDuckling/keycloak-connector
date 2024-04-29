import type {FastifyPluginAsync} from "fastify";
import {fastifyPlugin} from "fastify-plugin";
import {GenericAuthPlugin} from "./generic-auth-plugin.js";
import {GenericAuthConfig} from "./types.js";

const genericAuthFastifyPlugin: FastifyPluginAsync<GenericAuthConfig> = async (fastify, config): Promise<void> => {
    // Register the plugin
    const genericAuthPlugin = new GenericAuthPlugin(config);
    await fastify.kcc.registerAuthPlugin(genericAuthPlugin);

    // Decorate the fastify instance with keycloak
    fastify.decorate('kccGenericAuth', genericAuthPlugin.exposedEndpoints());
}

export const genericAuthFastify = fastifyPlugin(genericAuthFastifyPlugin, {
    fastify: '4.x',
    name: 'keycloak-connector-generic-auth-plugin',
    decorators: {
        fastify: ['kcc'],
    },
    dependencies: ['keycloak-connector-server'],
});
