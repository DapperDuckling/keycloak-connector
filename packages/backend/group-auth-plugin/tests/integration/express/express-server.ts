import './dot-env.js'; // Must be the first import
import express, {type Request} from 'express';
import {keycloakConnectorExpress, lock, clusterKeyProvider} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser";
import {redisClusterProvider} from "@dapperduckling/keycloak-connector-cluster-redis";
import {default as logger} from "pino-http";
import {groupAuth, groupAuthExpress} from "@dapperduckling/keycloak-connector-group-auth-plugin/express";

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

const clusterProvider = await redisClusterProvider({
    pinoLogger: loggerHttp.logger,
});

// Initialize the keycloak connector
const {registerAuthPlugin} = await keycloakConnectorExpress(app, {
    serverOrigin: `http://localhost:3005`,
    authServerUrl: 'http://localhost:8080/',
    validOrigins: ['http://localhost:3000'],
    realm: 'local-dev',
    refreshConfigMins: -1, // Disable for dev testing
    clusterProvider: clusterProvider,
    keyProvider: clusterKeyProvider,
    pinoLogger: loggerHttp.logger,
    fetchUserInfo: true,
});

await groupAuthExpress(app, registerAuthPlugin, {
    app: 'pegasus'
});

const router = express.Router();

// login required route
router.get('/', groupAuth(), (req, res) => {
    // Send the response
    res.send({ hello: 'world1' });
});

app.use(router);

// Test the merging of params
const router2 = express.Router({mergeParams: true});

// Org locked route
router2.get('/', groupAuth('random-permission'), (req, res) => {
    // Send the response
    res.send({ hello: 'world2' });
});

app.use("/:org_id", groupAuth(), router2);


app.listen(3005, () => {
    console.log(`express-${3005} :: Listening`);
});
