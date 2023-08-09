### keycloak-connector-server-cluster-aws-redis

### Description
Provides cluster communications through an AWS ElastiCache Redis cluster, enabling synchronized scaling without interruption to security nor user experience.

_**Why?**_
When scaling a project that uses `keycloak-connector-server`, each instance will have its own set of generated client JWKs and when polled a single public key will be given to Keycloak. This will likely result in failed logins as Keycloak doesn't know all the live public keys.

This plugin is written in order to synchronize this and other activities, such as backdoor logouts from Keycloak.


### AWS ElastiCache Setup

1. Create a new EC2 security group to link Redis to EC2 instances
   - Allow inbound connections on tcp/6379
2. Create a new ElastiCache default user
   - User Id: `<as desired>`
   - User name: `default`
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
    - User group: `<new group name>`
    - Add cluster to the new security group
5. Add the security group to any EC2 instances you want to have access

### Authenticating each application
1. Create a new user
   - User settings: \<as desired>
   - Authentication mode: IAM authentication (todo: determine how this works)
   - Access string: \<read below>
     - To restrict access to a specific of commands & partition data between users, we'll build a unique authentication string.
     - Example: `on ~my-cool-app:* &my-cool-app:* nocommands +@FAST`
     - The above allows read/write access to keys & pub/sub channels that match the `my-cool-app:*` glob and allows commands in the `FAST` category.

### Connecting through EC2 (bastion) instance
1. Copy the _(primary or configuration??)_ endpoint
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
