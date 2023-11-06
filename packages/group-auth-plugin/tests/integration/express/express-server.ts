// /// <reference path="../../../src/global.d.ts" />
import './dot-env.js'; // Must be the first import
import express, {type Request} from 'express';
import {keycloakConnectorExpress} from "keycloak-connector-server";
import cookieParser from "cookie-parser";
import {RedisClusterProvider} from "keycloak-connector-cluster-redis";
import {default as logger} from "pino-http";
import {clusterKeyProvider} from "keycloak-connector-server";
import {groupAuth, groupAuthExpress} from "keycloak-connector-group-auth-plugin/express";

// const test: Request = {}
// test.

const loggerHttp = logger.default({
    level: "debug",
    transport: {
        target: 'pino-pretty',
        options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
        },
    },
});

// Grab express app
const app = express();

app.use(loggerHttp);

// Register the cookie parser
app.use(cookieParser());

const clusterProvider = new RedisClusterProvider({
    pinoLogger: loggerHttp.logger,
});

// Initialize the keycloak connector
const {lock, registerAuthPlugin} = await keycloakConnectorExpress(app, {
    serverOrigin: `http://localhost:3005`,
    authServerUrl: 'http://localhost:8080/',
    realm: 'local-dev',
    refreshConfigMins: -1, // Disable for dev testing
    clusterProvider: clusterProvider,
    keyProvider: clusterKeyProvider,
    pinoLogger: loggerHttp.logger,
    fetchUserInfo: true,
});

await groupAuthExpress(app, registerAuthPlugin, {
    app: 'my-cool-app'
});

const router = express.Router();

// Public route
router.get('/', groupAuth('tasty'), groupAuth('tasty'), (req, res) => {
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

app.listen(3005, () => {
    console.log(`express-${3005} :: Listening`);
});
