import type {
    AuthPluginInternalConfig,
    AuthPluginOnRegisterConfig,
    ConnectorRequest,
    UserData
} from "keycloak-connector-server";
import {AbstractAuthPlugin, AuthPluginOverride} from "keycloak-connector-server";
import type {Logger} from "pino";
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

    public override async onRegister(onRegisterConfig: AuthPluginOnRegisterConfig) {
        // Ensure the fetch user info setting is configured
        if (onRegisterConfig.keycloakConfig.fetchUserInfo === undefined || onRegisterConfig.keycloakConfig.fetchUserInfo === false) {
            throw new Error("Must set `fetchUserInfo` in order to use Group Auth Plugin");
        }

        return undefined;
    }

    decorateResponse = async (connectorRequest: ConnectorRequest, userData: UserData, logger: Logger | undefined): Promise<void> => {
        // Decorate the user data with default group info
        connectorRequest.kccUserGroupAuthData = {
            appId: null,
            orgId: null,
            groups: null,
            debugInfo: {},
            ...this.exposedEndpoints(),
        }

        logger?.debug(`Group Auth plugin decorating response`);
    }

    isAuthorized = async (connectorRequest: ConnectorRequest, userData: UserData, logger: Logger | undefined): Promise<boolean> => {

        // Decorate the user data with group info
        connectorRequest.kccUserGroupAuthData = {
            appId: 'test',
            orgId: null,
            groups: null,
            debugInfo: {
                "app-search": false,
                "org-search": false,
            },
        }

        logger?.debug(`Group Auth plugin checking for authorization...`);

        // const userGroups = userData.userInfo.groups;
        //
        // // Check if the user is in the super admin group
        // if (userData.groups.includes('super-admin')) {
        //     return true;
        // }

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
        check: this.groupCheck,
    });

    groupAuth = () => {

    }

    groupCheck = () => {

    }

}
