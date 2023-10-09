import type {
    AuthPluginInternalConfig,
    AuthPluginOnRegisterConfig,
    ConnectorRequest,
    UserData
} from "keycloak-connector-server";
import {AbstractAuthPlugin, AuthPluginOverride} from "keycloak-connector-server";
import type {Logger} from "pino";
import type {GroupAuthUserData} from "./fastify/fastify.js";
import type {GroupAuthConfig} from "./types.js";

export class GroupAuthPlugin extends AbstractAuthPlugin {
    protected readonly _internalConfig: AuthPluginInternalConfig;
    protected readonly groupAuthConfig: GroupAuthConfig;

    constructor(config: GroupAuthConfig) {
        super();

        this._internalConfig = {
            name: 'GroupAuthPlugin',
            override: AuthPluginOverride.DISABLE_BASE_FUNCTION
        }

        // Check for an app name
        if (config.app === undefined) {
            throw new Error(`Cannot start group auth plugin, must specify an app name!`);
        }

        this.groupAuthConfig = config;
    }

    public override onRegister(onRegisterConfig: AuthPluginOnRegisterConfig) {
        return undefined;
    }

    isAuthorized = async (connectorRequest: ConnectorRequest, userData: UserData, logger: Logger | undefined): Promise<boolean> => {

        // Decorate the user data with group info
        const typedUserData = userData as GroupAuthUserData;
        typedUserData.groupAuth = {
            appId: 'test',
            orgId: null,
            groups: null,
            debugInfo: {
                "app-search": false,
                "org-search": false,
            }
        }

        logger?.debug(`Group Auth plugin checking for authorization...`);

        /**
         * Require Admin logic (user must have at least one of the listed permissions)
         *  - org_id in request:
         *      - darksaber-admin
         *      - organizations/<oid>/admin
         *  - app_id in request:
         *      - darksaber-admin
         *      - applications/<aid>/app-admin
         *  - org_id and app_id in request:
         *      - darksaber-admin
         *      - applications/<aid>/app-admin
         *      - applications/<aid>/<oid>/admin   AND organizations/<oid>/*
         */

        /**
         * Now you have access to the following variables:
         *      body.keycloak.ga.appId    (string or null)   // The validated application id
         *      body.keycloak.ga.orgId    (string or null)   // The validated organization id
         *      body.keycloak.ga.groups   (string[] or null) // The group (or all groups) that matched this rule
         *      body.keycloak.ga.debugInfo                   // An object to help describe the logic behind the request (for code dev)
         *      body.keycloak.userInfo    (object from KC) **already a part of base library
         */

        //todo: finish building
        return false;
    }

    exposedEndpoints = () => ({
        groupCheck: this.groupCheck,
    });

    groupAuth = () => {

    }

    groupCheck = () => {

    }

}
