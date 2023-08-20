import express from 'express';
import {keycloakConnectorExpress} from "keycloak-connector-server";
import cookieParser from "cookie-parser";
import type {Express} from "express-serve-static-core";
import {RedisClusterProvider} from "keycloak-connector-server-cluster-redis";
import logger from "pino-http";
import {clusterKeyProvider} from "keycloak-connector-server";
import {loggerOpts} from "./main.test.js";

export async function makeExpressServer(serverId: number) {
    const loggerOptsCloned = structuredClone(loggerOpts);
    loggerOptsCloned['msgPrefix'] = `express-${serverId} :: `;

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
    const lock = await keycloakConnectorExpress(app, {
        serverOrigin: 'http://localhost:3005',
        authServerUrl: 'http://localhost:8080/',
        realm: 'local-dev',
        refreshConfigMins: -1, // Disable for dev testing
        clusterProvider: clusterProvider,
        keyProvider: clusterKeyProvider,
    });

    return app;
}

export function startExpressServer(portId: number, app: Express) {
    // Convert sync function into async
    return new Promise<void>(() => {
        setTimeout(() => {
            // Start server
            const port = portId;
            app.listen(port, () => {
                console.log(`${port} :: Listening`);
            });
        }, 0);
    });
}