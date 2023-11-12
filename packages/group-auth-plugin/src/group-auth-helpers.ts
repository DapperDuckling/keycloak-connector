import type {GroupAuthsArray} from "./group-auth-builder.js";

export class GroupAuthHelpers {
    static readonly ANY_ADMIN = [
        "admin",  // Requires a user in the specified org with the admin app permission
        {
            config: { // Requires an app-admin
                requireAdmin: true,
            }
        }, {
            config: { // Requires an org-admin
                requireAdmin: true,
                appParam: undefined, // Ignore checking app id
            }
        }
    ]
    static readonly ORG_OR_APP_ADMIN = [
        {
            config: { // Requires an app-admin
                requireAdmin: true,
            }
        }, {
            config: { // Requires an org-admin
                requireAdmin: true,
                appParam: undefined, // Ignore checking app id
            }
        }
    ]
}
