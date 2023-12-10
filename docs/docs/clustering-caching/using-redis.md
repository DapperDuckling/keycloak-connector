---
sidebar_position: 2
---

# Using Redis

[//]: # (todo: Link to ioredis)
`RedisClusterProvider` uses `ioredis` under the hood. Configuration follows normal `ioredis` options with a few additions.

```sh
npm i @dapperduckling/keycloak-connector-cluster-redis
```

## Adding clustering support
```ts
// Two additional imports
import {clusterKeyProvider} from "@dapperduckling/keycloak-connector-server";
import {redisClusterProvider} from "@dapperduckling/keycloak-connector-cluster-redis";

// Prepare the redis cluster provider
const clusterProvider = await redisClusterProvider({
    redisOptions: {
        username: 'dev-only',
        password: 'my-cool-dev-password',
    }
});

await keycloakConnectorExpress(app, {
    clientId: 'keycloak-connector-example',
    clientSecret: 'PASSWORD_ONLY_USED_IN_DEV',
    serverOrigin: `http://localhost:${serverPort}`,
    authServerUrl: 'http://localhost:8080/',
    realm: 'master',
    
    // Two new options
    clusterProvider: clusterProvider,
    keyProvider: clusterKeyProvider,
});
```

## Configuration Options
### Credential Provider

## Security Considerations
### Environment variables


### Partitioning


### Least privilege
