// noinspection CommaExpressionJS

import {type GroupAuthConfig, type GroupAuthDebugPrintable, GroupAuthPlugin} from "../../src/index.js";

export class GroupPathBuilder {

    static MISSING_PARAM_CONFIG = "MISSING_PARAM_CONFIG";

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

    private appParam: string = GroupPathBuilder.MISSING_PARAM_CONFIG;
    private orgParam: string = GroupPathBuilder.MISSING_PARAM_CONFIG;


    constructor(groupAuthPlugin: GroupAuthPlugin) {
        this.groupAuthPlugin = groupAuthPlugin;
        this.updateParams();
    }

    setGroupAuthConfig = (groupAuthConfig: GroupAuthConfig) => {
        this.groupAuthConfig = groupAuthConfig;
        this.updateParams();
        return this;
    };

    private updateParams = () => {
        this.appParam = `<${this.groupAuthConfig?.appParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>`;
        this.orgParam = `<${this.groupAuthConfig?.orgParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>`;
    }

    app = (permission?: string, includeOrgParam = true) => {
        return this.appHandler(false, false, permission, includeOrgParam);
    }

    anyApp = (permission?: string, includeOrgParam = true) => {
        return this.appHandler(false, true, permission, includeOrgParam);
    }

    standalone = (permission?: string) => {
        return this.appHandler(true, false, permission, false);
    }

    anyStandalone = (permission?: string) => {
        return this.appHandler(true, true, permission, false);
    }

    private appHandler = (isStandalone: boolean, anyApp: boolean, permission?: string, includeOrgParam = true) => {

        const appSection = (anyApp) ? GroupAuthPlugin.DEBUG_ANY_APP : this.appParam;
        const orgSection = (anyApp) ? GroupAuthPlugin.DEBUG_ANY_ORG : this.orgParam;
        const prefix = (isStandalone) ? "standalone" : "applications";

        this.matchingGroups.appRequirements.push(`/${prefix}/${appSection}/${this.groupAuthConfig?.adminGroups?.appAdmin ?? ""}`);

        if (permission) {
            this.matchingGroups.appRequirements.push(`/${prefix}/${appSection}/${permission}`);

            if (includeOrgParam) {
                this.matchingGroups.appRequirements.push(`/${prefix}/${appSection}/${orgSection}/${permission}`);
                this.matchingGroups.orgRequirements.push(`/organizations/${orgSection}/*`);
            }
        }

        return this;
    }

    org = (permission?: string) => {
        return this.orgHandler(false, permission);
    }

    anyOrg = (permission?: string) => {
        return this.orgHandler(true, permission);
    }

    private orgHandler = (anyOrg: boolean, permission?: string) => {

        const orgSection = (anyOrg) ? GroupAuthPlugin.DEBUG_ANY_ORG : this.orgParam;

        this.matchingGroups.orgRequirements.push(`/organizations/${orgSection}/${this.groupAuthConfig?.adminGroups?.orgAdmin ?? ""}`);
        if (permission) {
            this.matchingGroups.orgRequirements.push(`/organizations/${orgSection}/${permission}`);
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
