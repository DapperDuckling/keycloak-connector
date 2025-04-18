import express from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser"

const serverPort = 5000;

// Grab express app
const app = express();

// Register the cookie parser
app.use(cookieParser());

// Initialize keycloak connector server
await keycloakConnectorExpress(app, {
    realm: 'kcc-example',
    clientId: 'example-express-app',
    clientSecret: '***REPLACE WITH CLIENT SECRET FROM KEYCLOAK***', // Dev only
    DANGEROUS_disableJwtClientAuthentication: true, // Dev only
    fetchUserInfo: true,
    serverOrigin: `http://localhost:${serverPort}`, // This server's origin
    authServerUrl: 'http://localhost:8080',        // Your keycloak server here
});

// Register a public route on the app
app.get('/', (req, res) => {
    res.send(`Public route`);
});

// Create a new router to secure all routes behind
const router = express.Router();

// Only authentication required route
router.get('/private', (req, res) => {
    res.send(`Private route`);
});

// Lock all routes in the router behind a login page
app.use(lock(), router);

// Start the server
app.listen(serverPort, () => {
    console.log(`express :: listening at http://localhost:${serverPort}`);
});
