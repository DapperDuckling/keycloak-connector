import type {GroupAuthConfig} from "../types.js";

export const GroupAuthConfigDefaults: Partial<GroupAuthConfig> = {
    orgParam: "org_id",
    appParam: "app_id",
    appIsStandalone: false,
    requireAdmin: false,
    adminGroups: {
        systemAdmin: "/darksaber-admin",
        allOrgAdmin: "/organizations/all-org-admin",
        allAppAdmin: "/applications/all-app-admin",
        appAdmin: "app-admin",
        orgAdmin: "org-admin",
    },
    defaultRequiredPermission: "user",
    appInheritanceTree: { "admin": "*" },
    orgInheritanceTree: { "admin": "*" },
    noImplicitApp: false
}
