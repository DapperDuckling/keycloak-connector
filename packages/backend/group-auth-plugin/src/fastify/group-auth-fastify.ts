import type {FastifyPluginAsync} from "fastify";
import {fastifyPlugin} from "fastify-plugin";
import {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {GroupAuthConfig, GroupAuthRouteConfig} from "../types.js";
import {groupAuth as groupAuthOriginal, type GroupAuthFunc} from "../group-auth-builder.js";

export type GroupAuthFastifyRouteOpt = {
    config: GroupAuthRouteConfig
}

export function groupAuth(...args: Parameters<GroupAuthFunc>): GroupAuthFastifyRouteOpt {
    const groupAuthRouteConfig: GroupAuthRouteConfig = groupAuthOriginal(...args);

    return {
        config: {
            ...groupAuthRouteConfig,
        }
    }
}

const groupAuthFastifyPlugin: FastifyPluginAsync<GroupAuthConfig> = async (fastify, groupAuthConfig): Promise<void> => {
    // Register the plugin
    const groupAuthPlugin = new GroupAuthPlugin(groupAuthConfig);
    await fastify.kcc.registerAuthPlugin(groupAuthPlugin);

    // Decorate the fastify instance with keycloak
    fastify.decorate('kccGroupAuth', groupAuthPlugin.exposedEndpoints());
}

export const groupAuthFastify = fastifyPlugin(groupAuthFastifyPlugin, {
    fastify: '4.x',
    name: 'keycloak-connector-group-auth-plugin',
    decorators: {
        fastify: ['kcc'],
        //todo: update this requirement
        // request: ['kccGroupAuthData'],
    },
    dependencies: ['keycloak-connector-server'],
});
