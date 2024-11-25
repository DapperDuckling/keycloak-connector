import express from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser"
import {getPinoLogger, responses} from "../common.mjs";

const serverPort = 3005;

// Grab express app
const app = express();

// Register the cookie parser
app.use(cookieParser());

// Initialize keycloak connector server
await keycloakConnectorExpress(app, {
    realm: 'kcc-example',
    clientId: 'example-express-app',
    clientSecret: 'EXAMPLE_SECRET_ONLY_IN_DEV',      // A password is not allowed in non-dev environments
    DANGEROUS_disableJwtClientAuthentication: true, // Only allowed in dev environments
    pinoLogger: getPinoLogger,
    fetchUserInfo: true,
    serverOrigin: `http://localhost:${serverPort}`, // This server's origin
    authServerUrl: 'http://localhost:8080/',        // Your keycloak server here
    validOrigins: ['http://localhost:3000'],
});

// Register a public route on the app
app.get('/', (req, res) => {
    res.send(responses.public);
});

// Create a new router to secure all routes behind
const router = express.Router();

// Only authentication required route
router.get('/no-role-required', (req, res) => {
    res.send(responses.noRole);
});

// Requires "COOL_GUY" role
router.get('/cool-guy', lock(['COOL_GUY']), (req, res) => {
    res.send(responses.coolGuy);
});

// Lock all routes in the router behind a login page
app.use(lock(), router);

// Start the server
app.listen(serverPort, () => {
    console.log(`express :: listening at http://localhost:${serverPort}`);
});
