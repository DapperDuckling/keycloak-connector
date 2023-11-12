import type {FastifyPluginAsync, RouteShorthandOptions} from "fastify";
import type {RouteGenericInterface} from "fastify/types/route.js";
import {groupAuth} from "@dapperduckling/keycloak-connector-group-auth-plugin/fastify";

export const routes: FastifyPluginAsync = async (fastify, options) =>  {

    // const test = groupAuths("thisgroup");

    // Define the basic route
    fastify.get('/s/:app_id/:org_id', groupAuth("testgroup"), async (request, reply) => {
        debugger;
    });

    fastify.get('/t/:my_org_param', groupAuth("testgroup", {
        orgParam: "my_org_param"
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
