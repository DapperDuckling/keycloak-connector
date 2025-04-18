---
sidebar_position: 2
---

# Using Redis

[//]: # (todo: Link to ioredis)
`RedisClusterProvider` uses **[ioredis](https://github.com/redis/ioredis)** under the hood. Configuration allows for existing **ioredis** options with a few additions.

```sh
npm i @dapperduckling/keycloak-connector-cluster-redis
```

## Adding clustering support
```ts
import express from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser";
// highlight-start
import {clusterKeyProvider} from "@dapperduckling/keycloak-connector-server";
import {redisClusterProvider} from "@dapperduckling/keycloak-connector-cluster-redis";
// highlight-end

// Grab express app
const app = express();

// Register the cookie parser
app.use(cookieParser());

// Prepare the redis cluster provider
// highlight-start
const clusterProvider = await redisClusterProvider({
    hostOptions: [{
       host: "localhost",
       port: 6379 
    }],
    redisOptions: {
        username: 'dev-only',
        password: 'my-cool-dev-password',
    }
});
// highlight-end

// Initialize keycloak connector server
await keycloakConnectorExpress(app, {
    clientId: 'keycloak-connector-example',
    clientSecret: 'PASSWORD_ONLY_USED_IN_DEV',    // A password is not allowed in non-dev environments
    serverOrigin: `http://localhost:3005`,
    authServerUrl: 'http://localhost:8080',    // Your keycloak server here!
    realm: 'master',
    // highlight-start
    clusterProvider: clusterProvider,
    keyProvider: clusterKeyProvider,
    // highlight-end
});

```

## Configuration Options



### Credential Provider
Using rotating keys? Or need to use a cloud provider's temporary token based authentication service?

Provide a function to `credentialProvider` that returns a `Credentials` object
```ts
export const redisCredentialProvider = async () => {
    try {
        const credentials = await awsCredentialProvider(); 
        
        return {
            password: credentials.secretAccessKey,
        }
    } catch (e) {
        console.error("Error getting AWS credentials", e);
        return undefined;
    }
}

const clusterProvider = await redisClusterProvider({
    credentialProvider: redisCredentialProvider,
});
```

## Security Considerations
### Environment variables


### Partitioning


### Least privilege
