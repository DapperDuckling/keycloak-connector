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
import {sleep} from "../helpers/utils.js";
import type {Logger} from "pino";

export class ExpressAdapter extends AbstractAdapter<SupportedServers.express> {
    private readonly app: Express;
    private readonly globalRouteConfig: KeycloakRouteConfig | undefined;
    private readonly pinoLogger: Logger | undefined;

    constructor(app: Express, customConfig: KeycloakConnectorConfigCustom) {
        super();

        this.app = app;
        this.globalRouteConfig = {
            ...RouteConfigDefault,
            ...customConfig.globalRouteConfig
        };

    }

    public buildConnectorRequest = async (request: Request): Promise<ConnectorRequest> => ({
        ...request.headers?.origin && {origin: request.headers?.origin},
        url: request.url,
        cookies: request.cookies,
        headers: request.headers,
        routeConfig: {
            ...this.globalRouteConfig,
            ...request.keycloak,
        }
    });

    public async handleResponse(connectorResponse: ConnectorResponse<SupportedServers.express>, req: Request, res: Response, next: NextFunction): Promise<void> {
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

            // Grab the file path
            // todo: remove hard coded path in this section

            // Send file (async style)
            res.sendFile(connectorResponse.serveFile, {
                root: './public/'
            }, () => {

                // Log the error
                this.pinoLogger?.error('Could not find file to serve', connectorResponse.serveFile)
                res.status(500).send
            });
            // await new Promise<void>((resolve, reject) => {
            //
            //     console.log('test1');
            //     res.sendFile(filePath, (err) => {
            //         console.log('test2');
            //         if (err) reject();
            //         resolve();
            //         console.log('test3');
            //     });
            // });

            //todo: future, have nginx serve the files
            // res.header("x-accel-redirect", "/protected-content/auth/index.html");

        } else {
            // Send a regular response
            res.send(connectorResponse.responseText ?? "");
        }
    }

    registerRoute = (options: RouteRegistrationOptions, connectorCallback: ConnectorCallback<SupportedServers.express>): void => {

        // Get the associated express HTTP method function
        const routerMethod = this.getRouterMethod(options);

        // Build any required lock
        const lockHandler = this.lock(options.isPublic ? undefined : []);

        // Register the route with route handler
        routerMethod(options.url, lockHandler, async (req, res, next) => {
            const connectorReq = await this.buildConnectorRequest(req);
            const response = await connectorCallback(connectorReq);
            await this.handleResponse(response, req, res, next);
        });
    };

    private getRouterMethod(options: RouteRegistrationOptions) {
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
    }

    public lock(roleRequirement?: RequiredRoles): RequestHandler {
        return (req, res, next) => {
            // Check for no lock requirement
            if (roleRequirement === undefined) return next();

            // Todo: do some more lock checking
            console.log('lock bypasses for now');
            next();
        }
    }

    // public test: RequestHandler = (req, res, next) => next();

    // public lock(roleRequirement?: RequiredRoles): RequestHandler {
    //     return async (req, res, next) => {
    //         // Check for no lock requirement
    //         // if (roleRequirement === undefined) next();
    //
    //         console.log(`Sleeping: ${new Date()}`);
    //         await sleep(2000);
    //         console.log(`Done: ${new Date()}`);
    //
    //         // Todo: do some more lock checking
    //         console.log('lock bypasses for now');
    //         next();
    //     }
    // }
}