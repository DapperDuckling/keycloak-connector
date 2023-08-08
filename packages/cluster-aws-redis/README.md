### keycloak-connector-server-cluster-aws-redis

### Description
Provides cluster communications through an AWS ElastiCache Redis cluster, enabling synchronized scaling without interruption to security nor user experience.

_Why?_
When scaling a project that uses `keycloak-connector-server`, each instance will have its own set of generated client JWKs and when polled a single public key will be given to Keycloak. This will likely result in failed logins as Keycloak doesn't know all the live public keys.

This plugin is written in order to synchronize this and other activities, such as backdoor logouts from Keycloak.


### AWS ElastiCache Setup

1. Create Redis Cluster
    - Careful when selecting the size of the instance, the tiniest one probably works for now
2. Create a security group
    - Allow inbound connections on tcp/6379
3. Add the security group to your cluster & any instances you want to have access
4. Create a user for this elasticache
   - **Access string**:


### Connecting through EC2 (bastion) instance
1. Copy the (primary) endpoint
2. Install redis
    ```sh 
    sudo yum install -y redis
    ```
3. Connect to the cluster
    ```sh
     redis-cli -h {replace_with_primary_endpoint} -p {replace_with_port_number}
    ```