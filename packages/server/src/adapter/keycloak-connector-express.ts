import type {Express} from "express-serve-static-core";
import {type KeycloakConnectorConfigCustom, SupportedServers} from "../types.js";
import {KeycloakConnector} from "../keycloak-connector.js";
import {ExpressAdapter} from "./express-adapter.js";

export const keycloakConnectorExpress = async (app: Express, customConfig: KeycloakConnectorConfigCustom) => {

    // Create an Express specific adapter
    const adapter = new ExpressAdapter(app, customConfig);

    // Initialize the keycloak connector
    const kcc = await KeycloakConnector.init<SupportedServers.express>(adapter, customConfig);

    // Add handler to every request
    app.use(async (req, res, next) => {

        // Check for cookies
        if (req.cookies === undefined) {
            throw new Error('`cookies` parameter not found on request, is `cookie-parser` installed and in use?');
        }

        // Grab user data
        const connectorReq = await adapter.buildConnectorRequest(req);
        req.keycloak = await kcc.getUserData(connectorReq);

        // Grab the protector response
        const connectorResponse = await kcc.buildRouteProtectionResponse(connectorReq, req.keycloak);

        // Handle the response
        if (connectorResponse) {
            await adapter.handleResponse(connectorResponse, req, res, next);
        } else  {
            next();
        }
    });

    return adapter.lock;
}