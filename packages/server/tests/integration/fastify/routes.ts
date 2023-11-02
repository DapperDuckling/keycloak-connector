import type {FastifyPluginAsync} from "fastify";
import {groupAuth} from "keycloak-connector-group-auth-plugin";

export const routes: FastifyPluginAsync = async (fastify, options) =>  {

    // Define the basic route
    fastify.get('/s', {kccRouteConfig: {public: true}}, async (request, reply) => {
        debugger;
    });

    // Define the basic route
    fastify.get('/', {kccRouteConfig: {public: true}}, async (request, reply) => {
        return { hello: 'world1' };
    });

    // Define protected routes
    fastify.get('/protected', async (request, reply) => {
        return { hello: 'PROTECTED BOI -- but no role requirement' };
    });

    // Define the basic route
    fastify.get('/coolguy', {kccRouteConfig: {roles: ['COOL_GUY']}}, async (request, reply) => {
        return { hello: 'PROTECTED BOI -- must have COOL_GUY role' };
    });

    fastify.get('/no_chance', {kccRouteConfig: {roles: ['no_chance_role']}}, async (request, reply) => {
        return { hello: 'PROTECTED BOI -- must have no_chance_role role' };
    });

    fastify.get('/roles_only', {kccRouteConfig: ['no_chance_role']}, async (request, reply) => {
        return { hello: 'PROTECTED BOI -- must have no_chance_role role' };
    });
}
