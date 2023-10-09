import type {AuthPluginInternalConfig, ConnectorRequest, UserData} from "keycloak-connector-server";
import {AbstractAuthPlugin, AuthPluginOverride} from "keycloak-connector-server";
import type {Logger} from "pino";

export class GroupAuth extends AbstractAuthPlugin {
    protected readonly internalConfig: AuthPluginInternalConfig;

    constructor() {
        super();

        this.internalConfig = {
            name: 'GroupAuth',
            override: AuthPluginOverride.DISABLE_BASE_FUNCTION
        }
    }

    isAuthorized = async (connectorRequest: ConnectorRequest, userData: UserData, logger: Logger | undefined): Promise<boolean> => {
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

}

export const groupAuth = () => {

}

export const groupAuthCheck = () => {

}

export const groupAuthConfig = () => {

}

export const groupAuthPlugin = () => {

}