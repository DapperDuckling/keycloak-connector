import './dot-env.js'; // Must be the first import
import express, {type Request} from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser";
import {default as logger} from "pino-http";

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

// app.use(loggerHttp);

// Register the cookie parser
app.use(cookieParser());

// Initialize the keycloak connector
const {registerAuthPlugin} = await keycloakConnectorExpress(app, {
    serverOrigin: `http://localhost:3005`,
    authServerUrl: process.env?.['KC_SERVER'] ?? 'http://localhost:8080',
    realm: process.env?.['KC_REALM'] ?? 'local-dev',
    keycloakVersionBelow18: process.env?.['KC_OLD_VERSION'] !== undefined ?? false,
    refreshConfigMins: -1, // Disable for dev testing
    pinoLogger: loggerHttp.logger,
    fetchUserInfo: true,
    decorateUserStatus: async (connectorRequest, logger) => {
        return {
            decorations: true,
            theTimeNow: new Date().toISOString(),
        };
    }
});

const router = express.Router();

// Public route
router.get('/', (req, res) => {
    // Send the response
    res.send({ hello: 'world1' });
});

// Lock all routes in this router behind a login page
// (must place before declaring any other routes for it to be effective)
// router.use(lock());

// Public route
router.get('/public', lock(false), (req, res) => {
    // Send the response
    res.send({ hello: 'world1' });
});


// Define protected routes
router.get('/protected', lock(), (req, res) => {
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
