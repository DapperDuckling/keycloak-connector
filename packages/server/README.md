### keycloak-connector-server

### Description
Keycloak Connector Server is an opinionated utility library built to ease integration of keycloak into existing nodejs Express or Fastify servers following the FAPI Security Profile 1.0 (baseline & advanced).

Simple [Keycloak](https://keycloak.org/) connector for [Node.js](https://nodejs.org/) projects using [Fastify](https://www.fastify.io/) or [Express](https://expressjs.com/)

## Securing Keycloak Clients
**It is imperative to enable `fapi-1-baseline` and `fapi-1-advanced` client profiles to ensure complete FAPI compliance.**
### Activate Client Profiles
1. Select realm -> Configure -> Realm Settings
2. Client policies tab
3. Policies tab
4. Create client policy -> Save
5. Add Condition
   - Condition Type: client-access-type
   - Client Access Type: confidential
6. Add Client Profile
    - `fapi-1-baseline`
    - `fapi-1-advanced`

Once complete, navigate to any client's settings page and hit `save`. Fix any save errors that are a result of the new policy.

Final step: Disable mTLS via `OAuth 2.0 Mutual TLS Certificate Bound Access Tokens Enabled` option on the `Advanced` tab.

## Getting started with Fastify
### Required packages
[//]: # (todo)

### Recommended Keycloak settings
[//]: # (todo)
#### Disable or remove default scopes
- Manage -> Client Scopes -> (any scope)
- Either
  - A) Change assigned type to "Optional"
  - B) Remove from access token
    - Click scope name -> Mappers -> Select Mapper
    - Disable add to ID token (if able)
    - Disable add to access token

### Install (for Fastify)
```shell
npm i keycloak-connector-server @fastify/static
```

### Setup the server
```typescript
import Fastify from 'fastify';
import {keycloakConnectorFastify} from 'keycloak-connector';

// Configure fastify
const fastify = Fastify({
    pluginTimeout: 120000, // Recommended to allow for up to two minutes 
});

// Initialize the connector
fastify.register(keycloakConnectorFastify, {
    authServerOrigin: 'http://localhost:8080',
    realm: 'the-sky',
    clientId: 'tactical-airlift',
    pinoLogger: fastify.log
});

// Start the server
try {
    await fastify.listen({port: 3000, host: '127.0.0.1'});
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}
```

By default, once the `keycloakConnectorFastify` plugin is registered, all unauthenticated requests are blocked.

### Add routes

```typescript
import {RoleLocations} from "keycloak-connector-server";

// Public route
fastify.get('/', {config: {public: true}}, async (request, reply) => {
    return 'I am publicly accessible, no login needed.';
});

// Default non-public route
fastify.get('/not-public', async (request, reply) => {
    return 'I am not public, but I do not require any particular roles to access.';
});

// Shorthand route configuration
fastify.get('/cool-person', {config: {roles: ['COOL_PERSON', 'NICE_PERSON']}}, async (request, reply) => {
    return 'I am not public and I require either the `cool_person` or `nice_person` role granted under this keycloak client to access.';
});

// Extended route configuration
fastify.get('/cool-person', {config: {roles: {[RoleLocations.REALM_ACCESS]: ['realm_lead']}}}, async (request, reply) => {
    return 'I am not public and I require the `realm_lead` role granted under the current keycloak realm to access.';
});
```

## Getting started with Express
### Required packages
[//]: # (todo)

### Setup the server
```typescript
import express from 'express';
import {keycloakConnectorExpress} from "keycloak-connector-server";
import cookieParser from "cookie-parser";
import logger from "pino-http"; // Optional, see below

// Grab express app
const app = express();

// Register the cookie parser
app.use(cookieParser());

// Initialize the keycloak connector
const lock = await keycloakConnectorExpress(app, {
    serverOrigin: 'http://localhost:3005',
    authServerUrl: 'http://localhost:8080/',
    realm: 'local-dev',
    refreshConfigMins: -1, // Disable for dev testing
    pinoLogger: logger().logger, // Optional, but without pinologger, log messages are supressed (ie. error, warn, etc...)
});

// Start server
const port = 5000;
app.listen(port, () => {
    console.log(`I'm alive on ${port}`);
});
```

### Add routes

```typescript
import {RoleLocations} from "keycloak-connector-server";

// Public route (default)
app.get('/', (req, res) => {
    // Send the response
    res.send('hey!');
});

// Non-public route
app.get('/not-public', lock(), (req, res) => {
    // Send the response
    res.send('hey, but hidden behind login!');
});

// Shorthand route configuration
app.get('/wow', lock(['cool_person', 'nice_person']), (req, res) => {
    // Send the response
    res.send('hey, but you have to have either the `cool_person` or `nice_person` roles');
});

// Extended route configuration
app.get('/wow', lock({roles: {[RoleLocations.REALM_ACCESS]: ['realm_lead']}}), (req, res) => {
    // Send the response
    res.send('hey, but you have to have the `realm_lead` role for this realm');
});
```
#### Restricting an entire `router`
> **Note**  
> Due to how Express handles middleware, a `lock` does not work in parallel or override a previous `lock`. Instead, they each stack on each other, making a route more restrictive.

```typescript

const router = express.Router();

// Lock all routes in this router behind a login page
// (must place before declaring any other routes for it to be effective)
router.use(lock());

// Public route  ***will not work since entire router is locked!
router.get('/', lock(false), (req, res) => {
    // Send the response
    res.send('hey!');
});

// Non-public route (default)
router.get('/not-public', (req, res) => {
    // Send the response
    res.send('hey, but hidden behind login!');
});

app.use(router);
```

## Specifying Role Requirements
### RoleRules (simple)
When passed a simple array, `keycloak-connector-server` will interpret this as a list of roles required for the current `client` (overridable by configuring `defaultResourceAccessKey`). Roles assumed to be logically OR'd unless wrapped inside an inner array where those roles are logically AND'd.

```typescript
// A user must either have the `nice_person` role OR have both the `mean_person` AND `has_counselor` roles
const requiredRoles = ['nice_person', ['mean_person', 'has_counselor']];

/** Typescript Example */
import {RoleRules} from "keycloak-connector-server";
enum Roles {
    nice_person = "nice_person",
    mean_person = "mean_person",
    has_counselor = "has_counselor"
}
const requiredRolesTs: RoleRules<Roles> = [Roles.nice_person, [Roles.mean_person, Roles.has_counselor]];

```

### ClientRole
Used when requiring roles from a client other than the current (or as configured with`defaultResourceAccessKey`) client. Each client is logically AND'd together.
```typescript
// A user must have either `eat_toast` OR `eat_bread` for `other_client` AND ALSO have the `make_bread` role for `random_client`
const requiredRoles = {
    other_client: ['eat_toast', 'eat_bread'],
    random_client: ['make_bread'],
}

/** Typescript Example */
import {ClientRole} from "keycloak-connector-server";
type CombinedRoles = OtherClientRoles | RandomClientRoles;
enum OtherClientRoles {
    eat_toast = "eat_toast",
    eat_bread = "eat_bread",
}
enum RandomClientRoles {
    make_bread = "make_bread"
}
enum Clients {
    other_client = "other_client",
    random_client = "random_client"
}
const requiredRolesTs: ClientRole<Clients, CombinedRoles> = {
    [Clients.other_client]: [OtherClientRoles.eat_toast, OtherClientRoles.eat_bread],
    [Clients.random_client]: [RandomClientRoles.make_bread],
}
```

### RoleLocation
Used when requiring roles from the `realm`. Can be used in combination with requiring `client` roles.
```typescript
// A user requires ALL of the following:
//  - The `buy_house` realm role
//  - Either the `eat_toast` or `eat_bread` role for `other_client`
//  - The `make_bread` role for `random_client`
const requiredRoles = {
    REALM_ACCESS: ['buy_house'],
    RESOURCE_ACCESS: {
        other_client: ['eat_toast', 'eat_bread'],
        random_client: ['make_bread'],
    }
}

/** Typescript Example */
import {RoleLocation} from "keycloak-connector-server";
type CombinedRoles = RealmRoles | OtherClientRoles | RandomClientRoles;
enum OtherClientRoles {
    eat_toast = "eat_toast",
    eat_bread = "eat_bread",
}
enum RandomClientRoles {
    make_bread = "make_bread"
}
enum Clients {
    other_client = "other_client",
    random_client = "random_client"
}
enum RealmRoles {
    buy_house = "buy_house"
}
const requiredRolesTs: RoleLocation<CombinedRoles, Clients> = {
    [RoleLocations.REALM_ACCESS]: [RealmRoles.buy_house],
    [RoleLocations.RESOURCE_ACCESS]: {
        [Clients.other_client]: [OtherClientRoles.eat_toast, OtherClientRoles.eat_bread],
        [Clients.random_client]: [RandomClientRoles.make_bread],
    }
}
```

### Array of CombinedRoleRules
Used for situations where multiple complex rules must be OR'd together.
```typescript
// A user must meet ANY ONE of the following requirements:
//  - Have either `eat_toast` OR `eat_bread` for `other_client` AND ALSO have the `make_bread` role for `random_client`
//  - Have the `pizza_person` role for the current client
const requiredRoles = [
    {
        other_client: ['eat_toast', 'eat_bread'],
        random_client: ['make_bread'],
    },
    ['pizza_person'],
];

// Typescript example
import {CombinedRoles} from "keycloak-connector-server";
enum Clients {
    other_client = "other_client",
    random_client = "random_client"
}
type CombinedRoles = OtherClientRoles | RandomClientRoles | CurrentClientRoles;
enum OtherClientRoles {
    eat_toast = "eat_toast",
    eat_bread = "eat_bread",
}
enum RandomClientRoles {
    make_bread = "make_bread"
}
enum CurrentClientRoles {
    pizza_person = "pizza_person"
}
const requiredRolesTs: RequiredRoles<CombinedRoles, Clients> = [
    {
        [Clients.other_client]: [OtherClientRoles.eat_toast, OtherClientRoles.eat_bread],
        [Clients.random_client]: [RandomClientRoles.make_bread],
    },
    [CurrentClientRoles.pizza_person],
];
```

## Advanced Configuration

### KeycloakConnector
```typescript
export interface KeycloakConnectorConfiguration {
    /** The RP server origin */
    serverOrigin: string;

    /** The OP server url */
    authServerUrl: string;

    /** The OP realm to use */
    realm: string;

    /** The RP client data */
    oidcClientMetadata: ClientMetadata;

    /** TLDR; KC versions < 18 have the /auth _prefix in the url */
    keycloakVersionBelow18?: boolean;

    /** How often should we ping the OP for an updated oidc configuration */
    refreshConfigMins?: number;

    /** Pino logger reference */
    pinoLogger?: Logger;

    /** Custom oidc discovery url */
    oidcDiscoveryUrlOverride?: string;

    /** Determines where the client will store a user's oauth token information */
    stateType?: StateOptions

    /**
     *  How long until the initial login sequence cookie expires. Shorter times may impact users who may take a while
     *  to finish logging in.
     */
    authCookieTimeout: number;

    /** Overrides the default routes created to handle keycloak interactions */
    routePaths?: CustomRouteUrl;

    /** Overrides the default configuration for all routes */
    globalRouteConfig?: KeycloakRouteConfig;

    /**
     * When a role rule doesn't specify a specific client, the default is to use the current `client_id` when
     * searching through the `resource_access` key of the JWT for required roles. Overridable here.
     */
    defaultResourceAccessKey?: string;

    /** When true, a case-sensitive search is used to match requirements to user's roles */
    caseSensitiveRoleCheck?: boolean;

    /** Optional claims required when verifying user-provided JWTs */
    jwtClaims?: {
        /** Require the user-provided JWT to be intended for a particular audience */
        audience?: string;

        /** Ensures the party to which the JWT was issued matches provided value. By default, azp must match the current `client_id` */
        azp?: string | AzpOptions;
    }

    /** Allows you to specify a built-in or pass a custom key provider */
    keyProvider?: ClassConstructor<AbstractKeyProvider>;
}
```

#### Config Types
```typescript
export enum StateOptions {
    STATELESS = 0,
    MIXED = 1,
    STATEFUL = 2,
}

export type CustomRouteUrl = {
    _prefix?: string;
    loginPage?: string;
    loginPost?: string;
    callback?: string;
    publicKeys?: string;
}

export type KeycloakRouteConfig = {
    public: true,
    autoRedirect?: boolean,
} | {
    public?: false,
    roles: RequiredRoles,
    autoRedirect?: boolean,
}

export enum AzpOptions {
    MUST_MATCH_CLIENT_ID = 0,
    MATCH_CLIENT_ID_IF_PRESENT = 1,
    IGNORE = 2,
}
```

##### Default unauthenticated requests handling
- **GET** - 307 redirect to initiate login request
- **[all other METHODs]** - 401 unauthorized

#### Environmental variables
`NODE_KEYCLOAK_CONNECTOR_LOGIN_COOKIE_TIMEOUT` Defaults to 30 minutes

#### Security Considerations
- State-less
  - Refresh token may be susceptible to DOS attack where a large payload is passed from the end-user to the client and the client passes to the OP during an automatic access token refresh
