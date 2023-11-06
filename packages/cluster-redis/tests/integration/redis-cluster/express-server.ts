import express from 'express';
import {keycloakConnectorExpress} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser";
import type {Express} from "express-serve-static-core";
import logger from "pino-http";
import {RedisClusterProvider} from "@dapperduckling/keycloak-connector-cluster-redis";
import {clusterKeyProvider} from "@dapperduckling/keycloak-connector-server";
import {loggerOpts} from "./main.test.js";
import {lock} from "@dapperduckling/keycloak-connector-server";

export async function makeExpressServer(port: number) {
    const loggerOptsCloned = structuredClone(loggerOpts);
    loggerOptsCloned['msgPrefix'] = `express-${port} :: `;

    const loggerHttp = logger(loggerOptsCloned);

    // Grab express app
    const app = express();

    app.use(loggerHttp);

    // Register the cookie parser
    app.use(cookieParser());

    const clusterProvider = new RedisClusterProvider({
        pinoLogger: loggerHttp.logger,
    });

    // Initialize the keycloak connector
    await keycloakConnectorExpress(app, {
        serverOrigin: `http://localhost:${port}`,
        authServerUrl: 'http://localhost:8080/',
        realm: 'local-dev',
        refreshConfigMins: -1, // Disable for dev testing
        clusterProvider: clusterProvider,
        keyProvider: clusterKeyProvider,
        pinoLogger: loggerHttp.logger,
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
