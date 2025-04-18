import express from 'express';
import {keycloakConnectorExpress} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser";
import type {Express} from "express-serve-static-core";
import logger from "pino-http";
import {redisClusterProvider} from "@dapperduckling/keycloak-connector-cluster-redis";
import {clusterKeyProvider} from "@dapperduckling/keycloak-connector-server";
import {loggerOpts} from "./main.test.js";
import {lock} from "@dapperduckling/keycloak-connector-server";
import {redisCredentialProvider} from "./orchestrator.js";

export async function makeExpressServer(port: number) {
    const loggerOptsCloned = structuredClone(loggerOpts);
    loggerOptsCloned['msgPrefix'] = `express-${port} :: `;

    const loggerHttp = logger(loggerOptsCloned);

    // Grab express app
    const app = express();

    // app.use(loggerHttp);

    // Register the cookie parser
    app.use(cookieParser());

    const clusterProvider = await redisClusterProvider({
        pinoLogger: loggerHttp.logger,
        redisOptions: {
            username: 'default',
            password: 'dev',
        }
    });

    // Initialize the keycloak connector
    await keycloakConnectorExpress(app, {
        serverOrigin: `http://localhost:3005`,
        ...(process.env['KC_SERVER_DISCOVERY_URL'] && {oidcDiscoveryUrlOverride: process.env['KC_SERVER_DISCOVERY_URL']}),
        authServerUrl: process.env['KC_SERVER'] ?? 'http://localhost:8080',
        ...(process.env['KC_CLIENT_ID'] && {clientId: process.env['KC_CLIENT_ID']}),
        realm: process.env['KC_REALM'] ?? 'local-dev',
        refreshConfigMins: -1, // Disable for dev testing
        pinoLogger: loggerHttp.logger,
        fetchUserInfo: true,
        decorateUserStatus: async (connectorRequest, logger) => {
            return {
                decorations: true,
                theTimeNow: new Date().toISOString(),
            };
        },
        validOrigins: ['http://localhost:3000'],
        clusterProvider: clusterProvider,
        keyProvider: clusterKeyProvider,
    });

    const router = express.Router();

    // Public route
    router.get('/', lock(false), (req, res) => {
        // Send the response
        res.send({ hello: 'world1' });
    });

    // Lock all routes in this router behind a login page
    // (must place before declaring any other routes for it to be effective)
    router.use(lock());

    // Public route
    router.get('/public', lock(false), (req, res) => {
        // Send the response
        res.send({ hello: 'world1' });
    });


    // Define protected routes
    router.get('/protected', (req, res) => {
        // Send the response
        res.send({ hello: 'PROTECTED BOI -- but no role requirement' });
    });

    // Define the basic route
    router.get('/coolguy', lock({roles: ['COOL_GUY']}), (req, res) => {
        // Send the response
        res.send({ hello: 'PROTECTED BOI -- must have COOL_GUY role' });
    });
    router.get('/no_chance', lock({roles: ['no_chance_role']}), (req, res) => {
        // Send the response
        res.send({ hello: 'PROTECTED BOI -- must have no_chance_role role' });
    });
    router.get('/roles_only', lock(['no_chance_role']), (req, res) => {
        // Send the response
        res.send({ hello: 'PROTECTED BOI -- must have no_chance_role role' });
    });

    app.use(router);

    return app;
}

export async function startExpressServer(portId: number, app: Express) {
    app.listen(portId, () => {
        console.log(`express-${portId} :: Listening`);
    });
}
