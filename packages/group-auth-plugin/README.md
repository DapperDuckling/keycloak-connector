### keycloak-connector-group-auth

### Description
A custom plugin enabling permission management via Keycloak groups. Adds functionality to keycloak-connector-server.

### Example Usage
```javascript
/** Example usage for ARM */
/** Example usage for ARM */
router.get(
    "/members/:org_id?",
    authenticateAdmin,
    groupAuths({
        requireAdmin: true,
    }),
    async (req, res) => {
        /**
         * Require Admin logic (user must have at least one of the listed permissions)
         *  - org_id in request:
         *      - darksaber-admin
         *      - organizations/<org_id>/admin
         *  - app_id in request:
         *      - darksaber-admin
         *      - applications/<app_id>/app-admin
         *  - org_id and app_id in request:
         *      - darksaber-admin
         *      - applications/<app_id>/app-admin
         *      - applications/<app_id>/<org_id>/admin   AND organizations/<org_id>/*
         */

        /**
         * Now you have access to the following variables:
         *      body.keycloak.ga.appId    (string or null)   // The validated application id
         *      body.keycloak.ga.orgId    (string or null)   // The validated organization id
         *      body.keycloak.ga.groups   (string[] or null) // The group (or all groups) that matched this rule
         *      body.keycloak.ga.debugInfo                   // An object to help describe the logic behind the request (for code dev)
         *      body.keycloak.userInfo    (object from KC) **already a part of base library
         */
    }
);


/** Example usage in a regular app */
const groupAuths = groupAuthConfig({
    app: 'fdrm',
    orgParam: 'org_id',                     // default value
    appParam: 'app_id',                     // default value
    requireAdmin: false,                    // default value
    superAdminGroup: '/darksaber-admin',    // default value
    permission: 'user',                     // default value
    listAllMatchingGroups: false,           // default value
    inheritanceTree: {
        'admin': ['supervisor'],
        'supervisor': ['user']
    },
});

router.get(
    `/:org_id/all-tools`,
    groupAuths('supervisor'),
    async (req, res) => {
        /**
         * Assuming request was '/1234-5678-90/all-tools', then...
         *
         * This route is accessible by those with any of the following groups:
         *   - `/darksaber-admin`
         *   - `/applications/fdrm/app-admin`
         *   - `/applications/fdrm/1234-5678-90/admin` AND `/organizations/1234-5678-90/*`
         *   - `/applications/fdrm/1234-5678-90/supervisor` AND `/organizations/1234-5678-90/*`
         */

    }
)

router.get(
    `/:app_id/status`,
    groupAuths('supervisor'),
    async (req, res) => {
        /**
         * Assuming request was '/ABCD-EFGH-IJ/status', then...
         *
         * This route is accessible by those with any of the following groups:
         *   - `/darksaber-admin`
         *   - `/applications/ABCD-EFGH-IJ/app-admin`
         *   - `/applications/ABCD-EFGH-IJ/<any org-id>/admin` AND `/organizations/<matching-org-id>/*`
         *   - `/applications/ABCD-EFGH-IJ/<any org-id>/supervisor` AND `/organizations/<matching-org-id>/*`
         */

    }
)

router.get(
    `/:app_id/:org_id/status`,
    groupAuths('supervisor'),
    async (req, res) => {
        /**
         * Assuming request was '/ABCD-EFGH-IJ/1234-5678-90/status', then...
         *
         * This route is accessible by those with any of the following groups:
         *   - `/darksaber-admin`
         *   - `/applications/ABCD-EFGH-IJ/app-admin`
         *   - `/applications/ABCD-EFGH-IJ/1234-5678-90/admin` AND `/organizations/1234-5678-90/*`
         *   - `/applications/ABCD-EFGH-IJ/1234-5678-90/supervisor` AND `/organizations/1234-5678-90/*`
         */

    }
)


router.get(
    `/status`,
    groupAuths('supervisor'),
    async (req, res) => {
        /**
         * Assuming request was '/status', then...
         *
         * This route is accessible by those with any of the following groups:
         *   - `/darksaber-admin`
         *   - `/applications/ABCD-EFGH-IJ/app-admin`
         *   - `/applications/ABCD-EFGH-IJ/supervisor`
         *   - `/applications/ABCD-EFGH-IJ/<any org-id>/admin` AND `/organizations/<matching-org-id>/*`
         *   - `/applications/ABCD-EFGH-IJ/<any org-id>/supervisor` AND `/organizations/<matching-org-id>/*`
         */

    }
)


router.get(
    `/status/:org_id`,
    groupAuths('supervisor', {noImplicitApp: true}),
    async (req, res) => {
        /**
         * Assuming request was '/status', then...
         *
         * This route is accessible by those with any of the following groups:
         *   - `/darksaber-admin`
         *   - `/organizations/ABCD-EFGH-IJ/app-admin`
         *   - `/organizations/ABCD-EFGH-IJ/supervisor`
         */

    }
)


/** Standalone function call */
// Use case: Endpoint exists to take N-number organization ids through a form POST, and need to confirm permissions
const hasPermission = groupAuthCheck({
    org_id: '1234-5678-90',
}, {
    requireAdmin: true,
    // ...add any other groupAuthConfig parameters
});

// Or even checking a certain privilege in each app
const hasPermission = groupAuthCheck({
    app_id: '1234-5678-90',
}, {
    permission: 'supervisor'
    // ...add any other groupAuthConfig parameters
});
```
