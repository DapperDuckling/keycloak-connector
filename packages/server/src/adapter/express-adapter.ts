import type {ConnectorCallback, RouteRegistrationOptions} from "./abstract-adapter.js";
import {AbstractAdapter} from "./abstract-adapter.js";
import type {
    ConnectorRequest,
    ConnectorResponse, ReqCookies,
    KeycloakConnectorConfigCustom,
    KeycloakRouteConfig, KeycloakRouteConfigOrRoles,
    SupportedServers
} from "../types.js";
import type {Express, NextFunction, Request, RequestHandler, Response} from "express-serve-static-core";
import {RouteConfigDefault} from "../helpers/defaults.js";
import type {Logger} from "pino";
import {KeycloakConnector} from "../keycloak-connector.js";
import bodyParser from "body-parser";
import {isObject} from "../helpers/utils.js";
import {TokenCache} from "../cache-adapters/index.js";

export class ExpressAdapter extends AbstractAdapter<SupportedServers.express> {

    private readonly app: Express;
    private _keycloakConnector: KeycloakConnector<SupportedServers.express> | undefined;
    private readonly globalRouteConfig: KeycloakRouteConfig | undefined;
    private readonly pinoLogger: Logger | undefined;

    private constructor(app: Express, customConfig: KeycloakConnectorConfigCustom) {
        super();

        this.app = app;
        this.pinoLogger = customConfig.pinoLogger;
        this.globalRouteConfig = {
            ...RouteConfigDefault,
            ...customConfig.globalRouteConfig
        };

    }

    public buildConnectorRequest = async <RouteConfig>(request: Request, routeConfig: RouteConfig | undefined): Promise<ConnectorRequest> => ({
        ...request.headers?.origin !== undefined && {origin: request.headers?.origin},
        url: request.url,
        urlParams: request.params,
        urlQuery: request.query,
        cookies: request.cookies as ReqCookies,
        headers: request.headers,
        routeConfig: {
            ...this.globalRouteConfig,
            // ...(routeConfig !== false) && routeConfig,
            ...routeConfig,
        },
        ...request.kccUserData !== undefined && {keycloak: request.kccUserData},
        ...isObject(request.body) && {body: request.body},
    });

    public handleResponse = async (connectorResponse: ConnectorResponse<SupportedServers.express>, req: Request, res: Response, next: NextFunction): Promise<void> => {

        try {
            // Safety check improper uses
            if (req._keycloakReqHandled) {
                throw new Error('Invalid adapter usage, attempted to handle response more than once for a single request.');
            }

            // Set handling flag
            req._keycloakReqHandled = true;

            // Set any cookies
            connectorResponse.cookies?.forEach(cookieParam => res.cookie(cookieParam.name, cookieParam.value, cookieParam.options));

            // Set the response code
            if (connectorResponse.statusCode !== undefined) res.status(connectorResponse.statusCode);

            // Handle exclusive parameters
            if (connectorResponse.redirectUrl !== undefined) {
                // Redirect if needed
                res.redirect(connectorResponse.redirectUrl);

            } else if (connectorResponse.serveFileFullPath !== undefined) {

                // Send file
                res.sendFile(connectorResponse.serveFileFullPath, (err) => {
                    res.status(404);
                    next();
                });

            } else {

                // Check if this is an html response
                if (connectorResponse.responseHtml !== undefined) {
                    // Add content type header
                    res.type('html');
                }

                // Send a regular response
                res.send(connectorResponse.responseHtml ?? connectorResponse.responseText ?? "");
            }
        } catch (e) {
            // Log the error
            this.pinoLogger?.error(e);

            // Serve the error
            next(new Error());
        }
    };

    registerRoute = (options: RouteRegistrationOptions, connectorCallback: ConnectorCallback<SupportedServers.express>): void => {

        // Get the associated express HTTP method function
        const routerMethod = this.getRouterMethod(options);

        // Build any required lock
        const lockHandler = lock(options.isUnlocked ? false : []);

        // Parse application/x-www-form-urlencoded
        const urlencodedParser = bodyParser.urlencoded({ extended: false })

        // Register the route with route handler
        routerMethod(options.url, lockHandler, urlencodedParser, async (req, res, next) => {
            const connectorReq = await this.buildConnectorRequest(req, {public: options.isUnlocked});
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

    public onRequest = async <RouteConfig = KeycloakRouteConfig>(routeConfig: RouteConfig | undefined, ...args: Parameters<RequestHandler>) => {

        // Extract the request handler params
        const [req, res, next] = args;

        // Check for cookie-parser plugin
        if (req.cookies === undefined) {
            throw new Error('`cookies` parameter not found on request, is `cookie-parser` package installed and in use?');
        }

        // Grab user data
        const connectorReq = await this.buildConnectorRequest<RouteConfig>(req, routeConfig);
        const userDataResponse = await this.keycloakConnector.getUserData(connectorReq);

        // Set any cookies from user data response
        userDataResponse.cookies?.forEach(cookieParam => res.cookie(cookieParam.name, cookieParam.value, cookieParam.options));

        // Store the user data
        req.kccUserData = userDataResponse.userData;

        // Removed to enable keycloak connector plugins
        // // Check for no lock requirement (public route)
        // if (routeConfigOrRoles === false) return next();

        // Grab the protector response
        const connectorResponse = await this.keycloakConnector.buildRouteProtectionResponse(connectorReq, req.kccUserData);

        // Handle the response
        if (connectorResponse) {
            await this.handleResponse(connectorResponse, req, res, next);
        } else {
            next();
        }
    }

    public get keycloakConnector() {
        return this._keycloakConnector as KeycloakConnector<SupportedServers.express>;
    }

    public static init = async (app: Express, customConfig: KeycloakConnectorConfigCustom) => {

        // Create a new adapter here
        const adapter = new this(app, customConfig);

        // Decorate all requests with the adapter
        // Dev note: This MUST go before the below kcc initiation. Order matters to Express.js
        app.use((req, res, next) => {
            // Ensure multiple adapters are not registered
            if (req.kccAdapter !== undefined) {
                throw new Error('Detected duplicate keycloak-connector registration, this is not supported.');
            }

            req.kccAdapter = adapter;
            next();
        });

        // Initialize the keycloak connector
        adapter._keycloakConnector = await KeycloakConnector.init<SupportedServers.express>(adapter, customConfig);

        //todo: update readme to reflect no automatic locking
        // // Add handler to every request
        // // Forcing all pages to require at least a valid login
        // app.use(adapter.lock([]));

        // return {
        //     lock: adapter.lock,
        //     ...adapter._keycloakConnector.getExposed()
        // };
        return adapter._keycloakConnector.getExposed()
    };
}

export const lock = (routeConfigOrRoles?: KeycloakRouteConfigOrRoles): RequestHandler => {
    return async (...args) => {
        // Determine the input route config type and build the requisite route config object
        let routeConfig: KeycloakRouteConfig | undefined;
        if (Array.isArray(routeConfigOrRoles) || routeConfigOrRoles === undefined) {
            routeConfig = {
                roles: routeConfigOrRoles ?? [],
            };
        } else if (routeConfigOrRoles === false) {
            routeConfig = {
                public: true,
            };
        } else {
            routeConfig = routeConfigOrRoles;
        }

        // Extract the request handler param
        const [req] = args;

        // Check that the adapter is even registered.
        if (req.kccAdapter === undefined) {
            throw new Error(`Keycloak connector adapter not register!`);
        }

        await req.kccAdapter.onRequest(routeConfig, ...args);
    };
}
