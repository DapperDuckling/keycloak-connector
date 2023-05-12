### keycloak-connector-server

### Description
DevilCloak Server is a utility library built to ease integration of keycloak into existing nodejs express servers

Simple [Keycloak](https://keycloak.org/) connector for [Node.js](https://nodejs.org/) projects using [Fastify](https://www.fastify.io/) ~~or [Express](https://expressjs.com/)~~

## Getting started with Fastify

### Setup the server
```typescript
import Fastify from 'fastify';
import {keycloakConnectorFastify} from 'keycloak-connector';

// Configure fastify
const fastify = Fastify();

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
```javascript
// Public route
fastify.get('/', {config: {public: true}}, async (request, reply) => {
    return 'I am publicly accessible, no login needed.';
});

// Default non-public route
fastify.get('/not-public', async (request, reply) => {
    return 'I am not public, but I do not require any particular roles to access.';
});

// Shorthand role requirement
fastify.get('/cool-guy', {config: {roles: ['COOL_GUY']}}, async (request, reply) => {
    return 'I am not public and I require the `cool_guy` role granted under this keycloak client to access.';
});
```

#### Typescript support

To add type hinting, simply set the `ContextConfig` generic to `KeycloakRouteConfig`

```typescript
// A public route with typescript!
fastify.get<RouteGenericInterface,KeycloakRouteConfig>('/', {config: {public: true}}, async (request, reply) => {
    return 'I am publicly accessible, no login needed.';
});
```

<sub>Why specifying the default `RouteGenericInterface` generic is also required: [microsoft/TypeScript#10571](https://github.com/microsoft/TypeScript/issues/10571)</sub>

## Getting started with Express

Not yet implemented.

## Specifying Role Requirements
### RoleRules (simple)
When passed a simple array, `keycloak-connector-server` will interpret this as a list of roles required for the current `client` (overridable by configuring `defaultResourceAccessKey`). Roles assumed to be logically OR'd unless wrapped inside an inner array where those roles are logically AND'd.

```typescript
// A user must either have the `nice_guy` role OR have both the `mean_guy` AND `has_counselor` roles
const requiredRoles = ['nice_guy', ['mean_guy', 'has_counselor']];

/** Typescript Example */
import {RoleRules} from "keycloak-connector-server";
enum Roles {
    nice_guy = "nice_guy",
    mean_guy = "mean_guy",
    has_counselor = "has_counselor"
}
const requiredRolesTs: RoleRules<Roles> = [Roles.nice_guy, [Roles.mean_guy, Roles.has_counselor]];

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
//  - Have the `pizza_guy` role for the current client
const requiredRoles = [
    {
        other_client: ['eat_toast', 'eat_bread'],
        random_client: ['make_bread'],
    },
    ['pizza_guy'],
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
    pizza_guy = "pizza_guy"
}
const requiredRolesTs: RequiredRoles<CombinedRoles, Clients> = [
    {
        [Clients.other_client]: [OtherClientRoles.eat_toast, OtherClientRoles.eat_bread],
        [Clients.random_client]: [RandomClientRoles.make_bread],
    },
    [CurrentClientRoles.pizza_guy],
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
    refreshConfigSecs?: number;

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
    loginCookieTimeout: number;

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