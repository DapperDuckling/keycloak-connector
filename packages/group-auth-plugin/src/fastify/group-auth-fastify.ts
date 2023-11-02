import type {FastifyPluginAsync} from "fastify";
import {fastifyPlugin} from "fastify-plugin";
import {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {GroupAuth, GroupAuthConfig} from "../types.js";

export type GroupAuthFastifyRouteOpt = {
    config: {
        groupAuth?: GroupAuth
    }
}

export type GroupAuthFastifyRouteConfig = GroupAuthFastifyRouteOpt['config'];

// *** Can we use these functions for the group auth express too?? Maybe the express plugin should extend the base one??
export function groupAuth(groupAuthConfig: GroupAuthConfig): GroupAuthFastifyRouteOpt;
export function groupAuth(group: string, groupAuthConfig?: GroupAuthConfig): GroupAuthFastifyRouteOpt;
export function groupAuth(groupOrConfig: GroupAuthConfig | string, groupAuthConfigOrNothing?: GroupAuthConfig): GroupAuthFastifyRouteOpt {

    let group;
    let groupAuthConfig;

    // Handle the different functional overloads
    if (typeof groupOrConfig === "string") {
        group = groupOrConfig;
        groupAuthConfig = groupAuthConfigOrNothing;
    } else {
        group = undefined;
        groupAuthConfig = groupOrConfig;
    }

    // Setup group auth config if not passed already
    //todo: replace with previous config from initial plugin registration
    //todo: do we need to do this?
    // groupAuthConfig ??= {
    //     app: 'test'
    // }

    // todo: return the object we will append to the fastify config param
    return {
        config: {
            groupAuth: {
                ...group && {group: group},
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
        // request: ['kccGroupAuthData'],
    },
    dependencies: ['keycloak-connector-server'],
});
