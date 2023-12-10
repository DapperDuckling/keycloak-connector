import express from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser"

const serverPort = 3005;

// Grab express app
const app = express();

// Register the cookie parser
app.use(cookieParser());

// Initialize keycloak connector server
await keycloakConnectorExpress(app, {
    clientId: 'keycloak-connector-example',
    clientSecret: 'PASSWORD_ONLY_USED_IN_DEV',      // A password is not allowed in non-dev environments
    serverOrigin: `http://localhost:${serverPort}`,
    authServerUrl: 'http://localhost:8080/',        // Your keycloak server here!
    realm: 'master',
});

// Register a public route on the app
app.get('/', (req, res) => {
    res.send('I am a public route and no authentication nor authorization is required to reach me.');
});

// Create a new router to secure all routes behind
const router = express.Router();

// Lock all routes in this router behind a login page
router.use(lock());

// Only authentication required route
router.get('/no-role-required', (req, res) => {
    res.send(`Since the router I'm attached to is uses 'lock()', this route only requires a user to login (authenticate) to access.`);
});

// Requires "COOL_GUY" role
router.get('/cool-guy', lock(['COOL_GUY']), (req, res) => {
    res.send(`This route requires an end-user to have the "COOL_GUY" role.`);
});

// Register the router with the app
app.use(router);

// Start the server
app.listen(3005, () => {
    console.log(`express :: listening`);
});
