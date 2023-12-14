---
sidebar_position: 1
---

# How it works

:::tip Core Concept

Production builds **do not** use a `client secret` to authenticate with Keycloak. _Instead_, Keycloak connects to this application to verify its public key before processing a request.

:::

Providing Keycloak Connector with a `KeyProvider` is required when running parallel instances of your backend. This ensures all instances share the same asymmetric key-pairs.

The easiest way forward is to use the provided `ClusterKeyProvider` while using a `ClusterProvider` (such as `RedisClusterProvider`).
