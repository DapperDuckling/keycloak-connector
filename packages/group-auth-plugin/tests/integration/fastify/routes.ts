import type {FastifyPluginAsync, RouteShorthandOptions} from "fastify";
import type {RouteGenericInterface} from "fastify/types/route.js";
import type {GroupAuth, GroupAuthRouteConfig} from "keycloak-connector-group-auth-plugin";
import {groupAuth} from "keycloak-connector-group-auth-plugin";

export const routes: FastifyPluginAsync = async (fastify, options) =>  {

    // const test = groupAuth("thisgroup");

    // Define the basic route
    fastify.get<RouteGenericInterface, GroupAuthRouteConfig>('/s/:oid', groupAuth("testgroup"), async (request, reply) => {
        debugger;
    });

    fastify.get<RouteGenericInterface, GroupAuthRouteConfig>('/t/:oid', groupAuth("testgroup", {
        orgParam: "my-org-param"
    }), async (request, reply) => {
        debugger;
    });

    // Define the basic route
    fastify.get('/', {config: {public: true}}, async (request, reply) => {
        return { hello: 'world1' };
    });

    // Define protected routes
    fastify.get('/protected', async (request, reply) => {
        return { hello: 'PROTECTED BOI -- but no role requirement' };
    });

    // Define the basic route
    fastify.get('/coolguy', {config: {roles: ['COOL_GUY']}}, async (request, reply) => {
        return { hello: 'PROTECTED BOI -- must have COOL_GUY role' };
    });

    fastify.get('/no_chance', {config: {roles: ['no_chance_role']}}, async (request, reply) => {
        return { hello: 'PROTECTED BOI -- must have no_chance_role role' };
    });

    fastify.get('/roles_only', {config: ['no_chance_role']}, async (request, reply) => {
        return { hello: 'PROTECTED BOI -- must have no_chance_role role' };
    });
}
