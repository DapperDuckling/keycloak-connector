---
sidebar_position: 10
---

# Bring Your Own

Want to use your own caching system? Keycloak Connector is highly modular and allows for custom caching solutions.

## Creating a cluster provider

You must create a class that implements `AbstractClusterProvider`.

For a baseline reference, see our Redis implementation: `@dapperduckling/keycloak-connector-cluster-redis`

## Using the cluster provider

It's as simple as passing your class to the cluster configuration

```ts


```
