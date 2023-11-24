[//]: # (Todo: Finish this)

No-implicit-app Permissions

### Admin permission
Input: groupAuth("admin");
    - Url: Has org & app param
    
Output:
    appRequirements: [
        '/applications/<app_id>/<org_id>/admin',
        '/applications/<app_id>/admin',
        '/applications/<app_id>/app-admin',
        '/applications/all-app-admin'
    ],
    orgRequirements: [ '/organizations/<org_id>/*', '/organizations/all-org-admin' ],
    systemAdmin: '/darksaber-admin'
------

### ORG_ADMINS_ONLY
Input: groupAuth({requireAdmin: "ORG_ADMINS_ONLY"});
    - Url: No params

Output:
    appRequirements: [],
    orgRequirements: [
        '/organizations/<ANY-ORG>/org-admin',
        '/organizations/all-org-admin'
    ],
    systemAdmin: '/darksaber-admin'
------

Input: groupAuth({requireAdmin: "ORG_ADMINS_ONLY"});
    - Url: Org param

Output:
    appRequirements: [],
    orgRequirements: [
        '/organizations/<org_id>/org-admin',
        '/organizations/all-org-admin'
    ],
    systemAdmin: '/darksaber-admin'
------

Input: groupAuth({requireAdmin: "ORG_ADMINS_ONLY"});
    - Url: App param

Output:
    appRequirements: [],
    orgRequirements: [
        '/organizations/<ANY-ORG>/org-admin',
        '/organizations/all-org-admin'
    ],
    systemAdmin: '/darksaber-admin'
------

Input: groupAuth({requireAdmin: "ORG_ADMINS_ONLY"});
    - Url: App & org param

Output:
    appRequirements: [],
    orgRequirements: [
        '/organizations/<org_id>/org-admin',
        '/organizations/all-org-admin'
    ],
    systemAdmin: '/darksaber-admin'
------

### APP_ADMINS_ONLY

Input: groupAuth({requireAdmin: "APP_ADMINS_ONLY"});
    - Url: No param

Output:
  appRequirements: [
    '/applications/<ANY-APP>/app-admin',
    '/applications/all-app-admin'
  ],
  orgRequirements: [],
  systemAdmin: '/darksaber-admin'
------

Input: groupAuth({requireAdmin: "APP_ADMINS_ONLY"});
    - Url: App param

Output:
  appRequirements: [ '/applications/<app_id>/app-admin', '/applications/all-app-admin' ],
  orgRequirements: [],
  systemAdmin: '/darksaber-admin'
------

Input: groupAuth({requireAdmin: "APP_ADMINS_ONLY"});
    - Url: Org param

Output:
  appRequirements: [
    '/applications/<ANY-APP>/app-admin',
    '/applications/all-app-admin'
  ],
  orgRequirements: [],
  systemAdmin: '/darksaber-admin'
------

Input: groupAuth({requireAdmin: "APP_ADMINS_ONLY"});
    - Url: App & org param

Output:
  appRequirements: [ '/applications/<app_id>/app-admin', '/applications/all-app-admin' ],
  orgRequirements: [],
  systemAdmin: '/darksaber-admin'
------

### Require admin: true

Input: groupAuth({requireAdmin: true});
    - Url: No param

Output:
  appRequirements: [],
  orgRequirements: [],
  systemAdmin: '/darksaber-admin'
------

Input: groupAuth({requireAdmin: true});
    - Url: Org param

Output:
  appRequirements: [],
  orgRequirements: [
    '/organizations/<org_id>/org-admin',
    '/organizations/all-org-admin'
  ],
  systemAdmin: '/darksaber-admin'
------

Input: groupAuth({requireAdmin: true});
    - Url: App & org param

Output:
  appRequirements: [ '/applications/<app_id>/app-admin', '/applications/all-app-admin' ],
  orgRequirements: [],
  systemAdmin: '/darksaber-admin'
------

