import type {ConnectorCallback, RouteRegistrationOptions} from "./abstract-adapter.js";
import {AbstractAdapter} from "./abstract-adapter.js";
import type {
    ConnectorRequest,
    ConnectorResponse,
    KeycloakConnectorConfigCustom,
    KeycloakRouteConfig,
    RequiredRoles,
    SupportedServers
} from "../types.js";
import type {Express, NextFunction, Request, RequestHandler, Response} from "express-serve-static-core";
import {RouteConfigDefault} from "../helpers/defaults.js";
import {KeycloakConnector} from "../keycloak-connector.js";

//todo: fix uses of `any` here

export class ExpressAdapter extends AbstractAdapter<SupportedServers.express> {
    private readonly app: Express;
    private readonly globalRouteConfig: KeycloakRouteConfig | undefined;

    private constructor(app: Express, customConfig: KeycloakConnectorConfigCustom) {
        super();

        this.app = app;
        this.globalRouteConfig = {
            ...RouteConfigDefault,
            ...customConfig.globalRouteConfig
        };

    }

    protected buildConnectorRequest = async (request: Request): Promise<ConnectorRequest> => ({
        ...request.headers?.origin && {origin: request.headers?.origin},
        url: request.url,
        cookies: request.cookies,
        headers: request.headers,
        routeConfig: {
            ...this.globalRouteConfig,
            ...request.keycloak,
        }
    });

    protected async handleResponse(connectorResponse: ConnectorResponse<SupportedServers.express>, req: Request, res: Response, next: NextFunction): Promise<void> {
        // Set any cookies
        //todo:
        // connectorResponse.cookies?.forEach(cookieParam => reply.setCookie(cookieParam.name, cookieParam.value, cookieParam.options));

        // Set the response code
        if (connectorResponse.statusCode) res.status(connectorResponse.statusCode);

        // Handle exclusive parameters
        if (connectorResponse.redirectUrl) {
            // Redirect if needed
            res.redirect(connectorResponse.redirectUrl);

        } else if (connectorResponse.serveFile) {
            // Send any files

            //todo: find up to date types
            // @ts-ignore
            res.sendFile(connectorResponse.serveFile);

            //todo: future, have nginx serve the files
            // res.header("x-accel-redirect", "/protected-content/auth/index.html");

        }

        // Send a regular response
        res.send(connectorResponse.responseText ?? "");
    }

    registerRoute = (options: RouteRegistrationOptions, connectorCallback: ConnectorCallback<SupportedServers.express>): void => {

        // Get the associated express HTTP method function
        const routerMethod = this.getRouterMethod(options);

        // Build any required lock
        const lock = this.lock(options.isPublic ? undefined : []);

        // Register the route with route handler
        routerMethod(options.url, lock, async (req, res, next) => {
            const connectorReq = await this.buildConnectorRequest(req);
            const response = await connectorCallback(connectorReq);
            await this.handleResponse(response, req, res, next);
        });
    };

    private getRouterMethod(options: RouteRegistrationOptions) {
        switch (options.method) {
            case "GET":
                return this.app.get;
            case "POST":
                return this.app.post;
            case "PUT":
                return this.app.put;
            case "PATCH":
                return this.app.patch;
            case "DELETE":
                return this.app.delete;
            case "OPTIONS":
                return this.app.options;
            case "HEAD":
                return this.app.head;

        }
    }

    public lock(roleRequirement?: RequiredRoles): RequestHandler {
        return (req, res, next) => {
            // Check for no lock requirement
            if (roleRequirement === undefined) next();

            // Todo: do some more lock checking
            console.log('lock bypasses for now');
            next();
        }
    }

    static init = async (app: Express, customConfig: KeycloakConnectorConfigCustom) => {

        // Create an Express specific adapter
        const adapter = new ExpressAdapter(app, customConfig);

        // Initialize the keycloak connector
        const kcc = await KeycloakConnector.init<SupportedServers.express>(adapter, customConfig);

        // Add handler to every request
        app.use(async (req, res, next) => {

            // Ignore 404 routes
            //todo:

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
        })
    }

}