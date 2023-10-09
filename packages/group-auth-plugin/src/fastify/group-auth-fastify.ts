import type {FastifyPluginAsync} from "fastify";
import {fastifyPlugin} from "fastify-plugin";
import {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {GroupAuthConfig} from "../types.js";

const groupAuthFastifyPlugin: FastifyPluginAsync<GroupAuthConfig> = async (fastify, groupAuthConfig): Promise<void> => {
    // Register the plugin
    const groupAuthPlugin = new GroupAuthPlugin(groupAuthConfig);
    fastify.kcc.registerAuthPlugin(groupAuthPlugin);

    // Decorate the fastify instance with keycloak
    fastify.decorate('kccGroupAuth', groupAuthPlugin.exposedEndpoints());
}

export const groupAuthFastify = fastifyPlugin(groupAuthFastifyPlugin, {
    fastify: '4.x',
    name: 'keycloak-connector-group-auth-plugin',
    decorators: {
        fastify: ['keycloak-connector-server'],
        request: ['keycloak-connector-server'],
    },
    // dependencies: ['@fastify/cookie'],
});