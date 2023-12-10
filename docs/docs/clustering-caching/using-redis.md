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
Using rotating keys? Or need to use a cloud provider's temporary token based authentication service?

Provide a function to `credentialProvider` that returns a `Credentials` object
```ts
export const redisCredentialProvider = async () => {
    try {
        const credentials = await awsCredentialProvider(); // Non-working function call, as of Nov 2023, AWS has not yet implemented Redis IAM support
        return {
            username: "USERNAME_MAY_NOT_BE_REQUIRED",
            password: credentials.secretAccessKey,
        }
    } catch (e) {
        console.error("Error getting AWS credentials", e);
        return undefined;
    }
}
```

## Security Considerations
### Environment variables


### Partitioning


### Least privilege
