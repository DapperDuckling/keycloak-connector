// noinspection CommaExpressionJS

import {GroupAuthConfig, type GroupAuthDebugPrintable, GroupAuthPlugin} from "../../src/index.js";

export class GroupPathBuilder {

    private groupAuthPlugin: GroupAuthPlugin;
    private config = {
        systemAdmin: false,
        allAppAdmin: false,
        allOrgAdmin: false,
        appAdmin: false,
        orgAdmin: false,
    }
    private matchingGroups: GroupAuthDebugPrintable['matchingGroups'] = {
        appRequirements: [],
        orgRequirements: [],
    }

    static MISSING_PARAM_CONFIG = "MISSING_PARAM_CONFIG";

    constructor(groupAuthPlugin: GroupAuthPlugin) {
        this.groupAuthPlugin = groupAuthPlugin;
    }

    app = (permission: string) => {
        this.matchingGroups.appRequirements.push(`/application`);
    }

    standalone = (permission: string) => {
        this.matchingGroups.appRequirements.push(`/application`);
    }

    default = () => this.systemAdmin().allAppAdmin().allOrgAdmin().appAdmin().orgAdmin();
    systemAdmin = () => (this.config.systemAdmin = true, this);
    allAppAdmin = () => (this.config.allAppAdmin = true, this);
    allOrgAdmin = () => (this.config.allOrgAdmin = true, this);
    appAdmin = () => (this.config.appAdmin = true, this);
    orgAdmin = () => (this.config.orgAdmin = true, this);

    output = (groupAuthConfig: GroupAuthConfig) => {
        // Prepare to output the list of groups
        const config = this.config;
        const appRequirements = this.matchingGroups.appRequirements;
        const orgRequirements = this.matchingGroups.orgRequirements;

        // Add the admin groups
        for (const [groupName, activated] of Object.entries(config)) {
            // Little bit jank way of checking for this, but it's only for our test suite...
            const target = (/org/i.test(groupName)) ? orgRequirements : appRequirements;
            // @ts-ignore - Ignore keys not matching
            if (activated) target.push(groupAuthConfig.adminGroups?.[groupName] ?? GroupPathBuilder.MISSING_PARAM_CONFIG);
        }

        // Add default app and org requirements
        if (!groupAuthConfig.noImplicitApp) {

            //todo: ******** THIS ENTIRE SECTION
            if (groupAuthConfig.defaultRequiredPermission) {
                appRequirements.push(`/application`);
            }

            appRequirements.push(`/application`);
            orgRequirements.push(`/organization`);
        }

        return this.matchingGroups;

    }
}
