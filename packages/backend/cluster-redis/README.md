### keycloak-connector-server-cluster-redis

### Description
Provides cluster communications through Redis, enabling synchronized scaling without interruption to security nor user experience.

_**Why?**_
When scaling a project that uses `keycloak-connector-server`, each instance will have its own set of generated client JWKs and when polled a single public key will be given to Keycloak. This will likely result in failed logins as Keycloak doesn't know all the live public keys.

This plugin is written in order to synchronize this and other activities, such as backdoor logouts from Keycloak.

### Fastify Configuration
```javascript
const fastify = Fastify({
   // Extend the fastify plugin timeout in order to allow for key negotiation
   pluginTimeout: 120000, 
});
```

### Setup Redis on AWS ElastiCache
##### STOP! If you're already using AWS ElastiCache, skip to [Authenticating each application](#authenticating-each-application)

1. Create a new EC2 security group to link Redis to EC2 instances
   - Allow inbound connections on tcp/6379
2. Create a new ElastiCache default user
   - User Id: `keycloak-connector-aws-redis-admin` (or any other)
   - Username: `default` (do not change)
   - Authentication mode: `Password(s)`
   - Password 1: `<Use a 64 character or more password>`
   - Access string: `on ~* &* +@all`
      - Or to disable logins with this account: `off ~* &* +@all`
3. Create a new ElastiCache user group
   - Add the new default user
4. Create Redis Cluster
    - **Note:** Careful when selecting the size of the instance, the tiniest one probably works for now
    - Transit encryption mode: `required`
    - Access control: `user group access control list`
    - User group: `keycloak-connector-aws-redis-channel` (or any other)
    - Add cluster to the new security group
5. Add the security group to any EC2 instances you want to have access

### Authenticating each application
1. Create new users (under "User management")
   - User settings: \<see below>
     - Recommend creating `kcc-<app name>-prod` & `kcc-<app name>-dev` accounts
   - Authentication mode: ~~IAM authentication~~ (not yet implemented by AWS SDKs. see: https://github.com/aws/aws-sdk/issues/556), use password
   - Access string: \<see below>
     - To restrict access to a specific of commands & partition data between users, we'll build a unique authentication string.
     - Template (fill in blanks): `on clearselectors resetkeys ~<app name>-<prod|dev>:* resetchannels &<app name>-<prod|dev>:* -@all +@fast +@pubsub +@keyspace +@string +@read +@write +@scripting -@dangerous +client|setname +info`
     - The above allows read/write access to keys & pub/sub channels that match the `my-cool-app-prod:*` glob and allows commands in the `FAST` category.
       - Note: After submitting, the final access string will not have `clearselectors`, `resetkeys`, and `resetchannels`. These are directives to force clear permissions for existing sessions.
2. Tie new users to the user group (under "User groups")
   - Select `keycloak-connector-aws-redis-channel` (or your group)
   - Modify
   - Manage
   - Enable the desired users

### Connecting through EC2 (bastion) instance
1. Copy the endpoint url
2. Install redis
    ```shell 
    sudo yum install -y redis
    ```
3. Check redis-cli version number. At least `>=6.0.0`
   ```shell
   redis-cli -v
   ```
   _...if the version is less than 6.0, skip to "Building redis from the source"_
4. Connect to the cluster
    ```shell
     redis-cli --tls -h {replace_with_primary_endpoint} -p {replace_with_port_number}
    ```
5. Ensure lack of permissions at this point
   ```shell
   > PING
   < (error) NOAUTH Authentication required.
   ```
6. Authenticate
   ```shell
   > AUTH default <password>
   < OK
   ```
   _**Note**: You may need to wrap your password in quotation marks (and even escape question marks in the password itself with a forward slash)_
7. Test connection
   ```shell
   > PING hi
   < "hi"
   ```
   
#### Building Redis from the source
0. Remove existing `redis`
   ```shell
   sudo yum remove redis
   ```
1. Install the required utilities
   ```shell
   sudo yum install -y make gcc openssl-devel
   ```
2. Build and install Redis
   ```shell
   cd ~
   wget https://download.redis.io/redis-stable.tar.gz
   tar -xzvf redis-stable.tar.gz
   cd redis-stable
   make distclean
   make BUILD_TLS=yes MALLOC=libc
   sudo make install
   ```
3. Cleanup redis install files

   _**WAIT!!!** Careful with the following command, ensure it points to the correct directory..._
   ```shell
   rm -rf ~/redis-*
   ```
