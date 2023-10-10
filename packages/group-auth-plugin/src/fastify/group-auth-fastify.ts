import type {FastifyPluginAsync} from "fastify";
import {fastifyPlugin} from "fastify-plugin";
import {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {GroupAuthConfig} from "../types.js";

const groupAuthFastifyPlugin: FastifyPluginAsync<GroupAuthConfig> = async (fastify, groupAuthConfig): Promise<void> => {
    // Ensure the fetch user info setting is configured
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (fastify.kcc.config?.fetchUserInfo === undefined || fastify.kcc.config?.fetchUserInfo === false) {
        throw new Error("Must set `fetchUserInfo` in order to use Group Auth Plugin");
    }

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
        fastify: ['kcc'],
        request: ['keycloak'],
    },
    dependencies: ['keycloak-connector-server'],
});