import type {FastifyPluginAsync} from "fastify";
import {fastifyPlugin} from "fastify-plugin";
import {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {GroupAuthConfig, GroupAuthRouteConfig} from "../types.js";
import {groupAuth as groupAuthOriginal} from "../group-auth-builder.js";


export type GroupAuthFastifyRouteOpt = {
    config: GroupAuthRouteConfig
}

export const groupAuth = (...args: Parameters<typeof groupAuthOriginal>): GroupAuthFastifyRouteOpt => {
    const {group, groupAuthConfig} = groupAuthOriginal(...args);

    return {
        config: {
            groupAuth: {
                ...group !== undefined && {group: group},
                ...groupAuthConfig && {config: groupAuthConfig}
            }
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
