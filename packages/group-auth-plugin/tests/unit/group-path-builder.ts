// noinspection CommaExpressionJS

import {type GroupAuthConfig, type GroupAuthDebugPrintable, GroupAuthPlugin} from "../../src/index.js";

export class GroupPathBuilder {

    private groupAuthPlugin: GroupAuthPlugin;
    private groupAuthConfig: GroupAuthConfig | undefined = undefined;
    private config = {
        systemAdmin: false,
        allAppAdmin: false,
        allOrgAdmin: false,
    }
    private matchingGroups: GroupAuthDebugPrintable['matchingGroups'] = {
        appRequirements: [],
        orgRequirements: [],
    }

    static MISSING_PARAM_CONFIG = "MISSING_PARAM_CONFIG";

    constructor(groupAuthPlugin: GroupAuthPlugin) {
        this.groupAuthPlugin = groupAuthPlugin;
    }

    setGroupAuthConfig = (groupAuthConfig: GroupAuthConfig) => (this.groupAuthConfig = groupAuthConfig, this);

    app = (permission: string, includeOrgParam = true) => {
        this.matchingGroups.appRequirements.push(`/applications/<${this.groupAuthConfig?.appParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>/${permission}`);
        this.matchingGroups.appRequirements.push(`/applications/<${this.groupAuthConfig?.appParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>/${this.groupAuthConfig?.adminGroups?.appAdmin ?? ""}`);

        if (includeOrgParam) {
            this.matchingGroups.appRequirements.push(`/applications/<${this.groupAuthConfig?.appParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>/<${this.groupAuthConfig?.orgParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>/${permission}`);
            this.matchingGroups.orgRequirements.push(`/organizations/<${this.groupAuthConfig?.orgParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>/*`);
        }

        return this;
    }

    standalone = (permission: string) => {
        this.matchingGroups.appRequirements.push(`/applications`);
        return this;
    }

    org = (permission?: string) => {
        this.matchingGroups.orgRequirements.push(`/organizations/<${this.groupAuthConfig?.orgParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>/${this.groupAuthConfig?.adminGroups?.orgAdmin ?? ""}`);

        if (permission) {
            this.matchingGroups.orgRequirements.push(`/organizations/<${this.groupAuthConfig?.orgParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>/${permission}`);
        }
        return this;
    }

    defaultAdmins = () => this.systemAdmin().allAppAdmin().allOrgAdmin();
    systemAdmin = () => (this.config.systemAdmin = true, this);
    allAppAdmin = () => (this.config.allAppAdmin = true, this);
    allOrgAdmin = () => (this.config.allOrgAdmin = true, this);

    output = () => {
        // Prepare to output the list of groups
        const config = this.config;
        const appRequirements = this.matchingGroups.appRequirements;
        const orgRequirements = this.matchingGroups.orgRequirements;

        // Add the global admin groups
        if (config.systemAdmin && this.groupAuthConfig?.adminGroups?.systemAdmin) this.matchingGroups.systemAdmin = this.groupAuthConfig?.adminGroups?.systemAdmin;
        if (config.allAppAdmin) this.matchingGroups.appRequirements.push(this.groupAuthConfig?.adminGroups?.allAppAdmin);
        if (config.allOrgAdmin) this.matchingGroups.orgRequirements.push(this.groupAuthConfig?.adminGroups?.allOrgAdmin);

        // Remove duplicates
        Object.entries(this.matchingGroups).forEach(([key, value]) => {
            // Skip non-arrays
            if (!Array.isArray(value)) return;

            // @ts-ignore
            this.matchingGroups[key] = [...new Set(value)];
        })

        return this.matchingGroups;

    }
}
