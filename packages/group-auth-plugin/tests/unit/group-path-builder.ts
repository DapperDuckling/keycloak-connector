// noinspection CommaExpressionJS

import {type GroupAuthConfig, type GroupAuthDebugPrintable, GroupAuthPlugin} from "../../src/index.js";

type orgParamOptions = true | "MATCHING" | false;
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
    private appParamValueSet: boolean = false;


    constructor(groupAuthPlugin: GroupAuthPlugin) {
        this.groupAuthPlugin = groupAuthPlugin;
        this.updateParams();
    }

    setGroupAuthConfig = (groupAuthConfig: GroupAuthConfig) => {
        this.groupAuthConfig = groupAuthConfig;
        this.updateParams();
        return this;
    };

    appParamValueIsSet = () => {
        this.appParamValueSet = true;
        return this;
    }

    private updateParams = () => {
        this.appParam = `<${this.groupAuthConfig?.appParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>`;
        this.orgParam = `<${this.groupAuthConfig?.orgParam ?? GroupPathBuilder.MISSING_PARAM_CONFIG}>`;
    }

    app = (permission?: string, orgParam: orgParamOptions = true) => {
        return this.appHandler(false, false, permission, orgParam);
    }

    anyApp = (permission?: string, orgParam: orgParamOptions = true) => {
        return this.appHandler(false, true, permission, orgParam);
    }

    standalone = (permission?: string) => {
        return this.appHandler(true, false, permission, false);
    }

    anyStandalone = (permission?: string) => {
        return this.appHandler(true, true, permission, false);
    }

    private appHandler = (isStandalone: boolean, anyApp: boolean, permission?: string, orgParam: orgParamOptions = true) => {

        let appSection: string;
        if (anyApp) {
            appSection = GroupAuthPlugin.DEBUG_ANY_APP;
        // } else if (this.appParamValueSet) {
        //     appSection = GroupAuthPlugin.DEBUG_SPECIFIED_APP;
        } else {
            appSection = this.appParam;
        }
        let orgSection: string;
        let appOrgSection: string;
        if (anyApp) {
            orgSection = appOrgSection = GroupAuthPlugin.DEBUG_ANY_ORG;
        } else if (orgParam === "MATCHING") {
            appOrgSection = GroupAuthPlugin.DEBUG_ANY_ORG;
            orgSection = GroupAuthPlugin.DEBUG_MATCHING_ORG;
        } else {
            orgSection = appOrgSection = this.orgParam;
        }

        const prefix = (isStandalone) ? "standalone" : "applications";

        this.matchingGroups.appRequirements.push(`/${prefix}/${appSection}/${this.groupAuthConfig?.adminGroups?.appAdmin ?? ""}`);

        if (permission) {
            this.matchingGroups.appRequirements.push(`/${prefix}/${appSection}/${permission}`);

            if (orgParam) {
                this.matchingGroups.appRequirements.push(`/${prefix}/${appSection}/${appOrgSection}/${permission}`);
                this.matchingGroups.orgRequirements.push(`/organizations/${orgSection}/*`);
            }
        }

        return this;
    }

    org = (permission?: string) => {
        return this.orgHandler("PARAM", permission);
    }

    anyOrg = (permission?: string) => {
        return this.orgHandler("ANY", permission);
    }

    matchingOrg = (permission?: string) => {
        return this.orgHandler("MATCHING", permission);
    }

    private orgHandler = (org: "ANY" | "MATCHING" | "PARAM", permission?: string) => {

        // Add a switch statement based on input org
        let orgSection;
        switch(org) {
            case "ANY":
                orgSection = GroupAuthPlugin.DEBUG_ANY_ORG;
                break;
            case "MATCHING":
                orgSection = GroupAuthPlugin.DEBUG_MATCHING_ORG;
                break;
            case "PARAM":
                orgSection = this.orgParam;
                break;
        }

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
