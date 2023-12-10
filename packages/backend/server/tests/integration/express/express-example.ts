import express from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser"
import {default as logger} from "pino-http"; // Optional (see below)

// Grab express app
const app = express();

// Register the cookie parser
app.use(cookieParser());

// Optional -- Add pino logger
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

// Initialize keycloak connector server
await keycloakConnectorExpress(app, {
    serverOrigin: `http://localhost:3005`,
    authServerUrl: 'http://localhost:8080/',
    realm: 'local-dev',
    refreshConfigMins: -1, // Disable for dev testing
    pinoLogger: loggerHttp.logger,
    fetchUserInfo: true,
});

// Register a public route on the app
app.get('/', (req, res) => {
    res.send('I am a public route and no authentication nor authorization is required to reach me.');
});

// Create a new router to secure all routes behind
const router = express.Router();

// Lock all routes in this router behind a login page
// (must declare before registering any other routes on this route)
router.use(lock());

// Only authentication required route
router.get('/no-role-required', (req, res) => {
    res.send(`Since the router I'm attached to is uses 'lock()', this route only requires a user to login (authenticate) to access.`);
});

// Requires "COOL_GUY" role
router.get('/cool-guy', lock(['COOL_GUY']), (req, res) => {
    // Send the response
    res.send(`This route requires an end-user to have the "COOL_GUY" role.`);
});

// Register the router with the app
app.use(router);

// Start the server
app.listen(3005, () => {
    console.log(`express :: listening`);
});
