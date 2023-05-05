
# keycloak-connector

Simple [Keycloak](https://keycloak.org/) connector for [Node.js](https://nodejs.org/) projects using [Fastify](https://www.fastify.io/) ~~or [Express](https://expressjs.com/)~~

## Getting Started
### Fastify
Once the `keycloakConnectorFastify` plugin is registered, all requests must be authenticated (unless the specific route specifies otherwise).

Unauthenticated requests are handled as such:
* **GET** - 307 redirect to initiate login request
* **[all others]** - 401 unauthorized

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

#### Adding typing to route context configuration

Set the `ContextConfig` generic to `KeycloakRouteConfig`

```typescript
// A public route
fastify.get<RouteGenericInterface,KeycloakRouteConfig>('/', {config: {public: true}}, async (request, reply) => {
    return { hello: 'world' };
});
```

<sub>See why specifying the default `RouteGenericInterface` generic is also required: [microsoft/TypeScript#10571](https://github.com/microsoft/TypeScript/issues/10571)</sub>

### Express

Not yet implemented.

## Documentation

### Fastify
#### Connector Options
```typescript
export interface KeycloakConnectorConfiguration {
    /** The OP server url */
    authServerOrigin: string;

    /** The OP realm to use */
    realm: string;

    /** The RP client data */
    oidcClientMetadata: ClientMetadata;

    /** TLDR; KC versions < 18 have the /auth _prefix in the url */
    keycloakVersionBelow18?: boolean;

    /** How often should we ping the OP for an updated oidc configuration */
    refreshConfigSecs?: number | null;

    /** Pino logger reference */
    pinoLogger?: BaseLogger | null;

    /** Custom oidc discovery url */
    oidcDiscoveryUrlOverride?: string | null;

    /** Sends a 401 for unauthenticated GET requests when set to FALSE, otherwise sends a redirect */
    unauthenticatedGetRequestRedirect?: boolean;
}
```

#### Route configuration options
```typescript
export interface KeycloakRouteConfig {
    public: boolean;
    roles: string[]; // experimental--subject to change
}
```

#### Environmental variables
`NODE_KEYCLOAK_CONNECTOR_LOGIN_COOKIE_TIMEOUT` Defaults to 30 minutes