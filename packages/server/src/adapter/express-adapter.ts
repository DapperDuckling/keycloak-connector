import type {ConnectorCallback, RouteRegistrationOptions} from "./abstract-adapter.js";
import {AbstractAdapter} from "./abstract-adapter.js";
import type {
    CombinedRoleRules,
    ConnectorRequest,
    ConnectorResponse,
    KeycloakConnectorConfigCustom,
    KeycloakRouteConfig, KeycloakRouteConfigOrRoles,
    RequiredRoles,
    SupportedServers
} from "../types.js";
import type {Express, NextFunction, Request, RequestHandler, Response} from "express-serve-static-core";
import {RouteConfigDefault} from "../helpers/defaults.js";
import type {Logger} from "pino";
import {KeycloakConnector} from "../keycloak-connector.js";

export class ExpressAdapter extends AbstractAdapter<SupportedServers.express> {

    private readonly app: Express;
    private _keycloakConnector: KeycloakConnector<SupportedServers.express> | undefined;
    private readonly globalRouteConfig: KeycloakRouteConfig | undefined;
    private readonly pinoLogger: Logger | undefined;

    private constructor(app: Express, customConfig: KeycloakConnectorConfigCustom) {
        super();

        this.app = app;
        this.globalRouteConfig = {
            ...RouteConfigDefault,
            ...customConfig.globalRouteConfig
        };

    }

    public buildConnectorRequest = async (request: Request, routeConfigOrRoles: KeycloakRouteConfigOrRoles): Promise<ConnectorRequest> => {

        // Determine the input route config type and build the requisite route config object
        const routeConfig: KeycloakRouteConfig = (Array.isArray(routeConfigOrRoles) || routeConfigOrRoles === undefined) ? {
            roles: routeConfigOrRoles ?? []
        } : routeConfigOrRoles;

        return ({
            ...request.headers?.origin && {origin: request.headers?.origin},
            url: request.url,
            cookies: request.cookies,
            headers: request.headers,
            routeConfig: {
                ...this.globalRouteConfig,
                ...routeConfig,
            }
        });
    };

    //todo: wrap this in a try catch handler send 500 on errors
    public handleResponse = async (connectorResponse: ConnectorResponse<SupportedServers.express>, req: Request, res: Response, next: NextFunction): Promise<void> => {

        // Safety check improper uses
        if (req._keycloakReqHandled) {
            throw new Error('Invalid adapter usage, attempted to handle response more than once for a single request.');
        }

        // Set handling flag
        req._keycloakReqHandled = true;

        // Set any cookies
        connectorResponse.cookies?.forEach(cookieParam => res.cookie(cookieParam.name, cookieParam.value, cookieParam.options));

        // Set the response code
        if (connectorResponse.statusCode) res.status(connectorResponse.statusCode);

        // Handle exclusive parameters
        if (connectorResponse.redirectUrl) {
            // Redirect if needed
            res.redirect(connectorResponse.redirectUrl);

        } else if (connectorResponse.serveFile) {

            // Grab the file path
            const fileToServe = connectorResponse.serveFile;
            // todo: remove hard coded path in this section

            //todo: test error handling
            // Send file (async style)
            await new Promise<void>((resolve, reject) => {
                res.sendFile(fileToServe, {
                    root: './public/'
                }, (err) => {
                    if (err) {
                        this.pinoLogger?.error('Could not find file to serve', connectorResponse.serveFile);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });


            //todo: future, have nginx serve the files
            // res.header("x-accel-redirect", "/protected-content/auth/index.html");

        } else {
            // Send a regular response
            res.send(connectorResponse.responseText ?? "");
        }
    };

    registerRoute = (options: RouteRegistrationOptions, connectorCallback: ConnectorCallback<SupportedServers.express>): void => {

        // Get the associated express HTTP method function
        const routerMethod = this.getRouterMethod(options);

        // Build any required lock
        const lockHandler = this.lock(options.isPublic ? false : []);

        // Register the route with route handler
        routerMethod(options.url, lockHandler, async (req, res, next) => {
            const connectorReq = await this.buildConnectorRequest(req, {public: options.isPublic});
            const response = await connectorCallback(connectorReq);
            await this.handleResponse(response, req, res, next);
        });
    };

    private getRouterMethod = (options: RouteRegistrationOptions) => {
        switch (options.method) {
            case "GET":
                return this.app.get.bind(this.app);
            case "POST":
                return this.app.post.bind(this.app);
            case "PUT":
                return this.app.put.bind(this.app);
            case "PATCH":
                return this.app.patch.bind(this.app);
            case "DELETE":
                return this.app.delete.bind(this.app);
            case "OPTIONS":
                return this.app.options.bind(this.app);
            case "HEAD":
                return this.app.head.bind(this.app);
        }
    };

    // private lock = (roleRequirement?: RequiredRoles | false): RequestHandler => async (req, res, next) => {
    private lock = (routeConfigOrRoles?: KeycloakRouteConfigOrRoles | false): RequestHandler => async (req, res, next) => {

        // Check for cookies
        if (req.cookies === undefined) {
            throw new Error('`cookies` parameter not found on request, is `cookie-parser` installed and in use?');
        }

        // Check for no lock requirement
        if (routeConfigOrRoles === false) return next();

        // Grab user data
        const connectorReq = await this.buildConnectorRequest(req, routeConfigOrRoles);
        req.keycloak = await this.keycloakConnector.getUserData(connectorReq);

        // Grab the protector response
        const connectorResponse = await this.keycloakConnector.buildRouteProtectionResponse(connectorReq, req.keycloak);

        // Handle the response
        if (connectorResponse) {
            await this.handleResponse(connectorResponse, req, res, next);
        } else {
            next();
        }
    };

    // Private getter for due to type checking. Keycloak connector is set later in initialization,
    // but will not be used until after initialization is complete.
    private get keycloakConnector() {
        return this._keycloakConnector as KeycloakConnector<SupportedServers.express>;
    }

    public static init = async (app: Express, customConfig: KeycloakConnectorConfigCustom) => {

        // Create a new adapter here
        const adapter = await new this(app, customConfig);

        // Initialize the keycloak connector
        adapter._keycloakConnector = await KeycloakConnector.init<SupportedServers.express>(adapter, customConfig);

        // Add handler to every request
        // Forcing all pages to require at least a valid login
        app.use(adapter.lock([]));

        return adapter.lock;
    };
}