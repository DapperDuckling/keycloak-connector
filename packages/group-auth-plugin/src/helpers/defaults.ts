import type {GroupAuthConfig} from "../types.js";

export const GroupAuthConfigDefaults: Partial<GroupAuthConfig> = {
    orgParam: "org_id",
    appParam: "app_id",
    requireAdmin: false,
    adminGroups: {
        superAdmin: "/darksaber-admin",
        allOrgAdmin: "org-admin",
        appAdmin: "app-admin",
    },
    defaultRequiredPermission: "user",
    appInheritanceTree: { "admin": "*" },
    orgInheritanceTree: { "admin": "*" },
    noImplicitApp: false
}
