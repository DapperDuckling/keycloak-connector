import express from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser"
import {getPinoLogger, responses} from "../common.js";

const serverPort = 3000;

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
    serverOrigin: `http://localhost:${serverPort}`, // This backend server's origin
    authServerUrl: 'http://localhost:8080/',        // Your keycloak server here

    /** Uncomment the following options to enable dev on a client served on a different port */
    // validOrigins: [
    //     `http://localhost:3005`,
    // ],
    // redirectUri: `http://localhost:3005`,

    /**
     * Uncomment and configure the following option for production when your backend and frontend are hosted
     *  on the same port, but backend routes have a different url prefix
     */
    // routePaths: {
    //     '_prefix': '/api/auth'
    // }
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
    console.log(`express :: listening on ${serverPort}`);
});
