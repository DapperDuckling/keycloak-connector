import {type Listener, type LockOptions, sleep} from "@dapperduckling/keycloak-connector-server";
import {
    AbstractClusterProvider,
    BaseClusterEvents,
    promiseWaitTimeout
} from "@dapperduckling/keycloak-connector-server";
import {
    deferredFactory,
    isDev, isObject,
} from "@dapperduckling/keycloak-connector-common";
import {webcrypto} from "crypto";
import * as fs from "fs";
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import Redis, {Cluster} from "ioredis";
import type {
    ClusterMode,
    RedisClient,
    RedisClusterConfig,
} from "./types.js";
import {RedisClusterEvents} from "./types.js";
import {EventEmitter} from "node:events";

class RedisClusterProvider extends AbstractClusterProvider<RedisClusterEvents> {

    protected override clusterConfig: RedisClusterConfig;
    private readonly client: RedisClient;
    private readonly subscriber: RedisClient;
    private connectionData = {
        clientConnected: false,
        subscriberConnected: false,
        subscriberHadToReconnect: false,
    }
    private readonly uniqueClientId: string;
    private readonly subscriptionListeners = new EventEmitter();
    private readonly SUB_EVENT_PREFIX = `-`; // Used when sending events to the subscription event emitter to ensure an "error" is never sent
    private readonly CREDENTIALS_UPDATE_INTERVAL = 60;
    private readonly MAX_CREDENTIALS_WAIT = 60000;
    private updatingCredentials: Promise<undefined> | undefined;


    protected constructor(config: RedisClusterConfig) {
        super(config);

        // Generate a unique id for this client
        this.uniqueClientId = `${Date.now()}-${webcrypto.randomUUID()}`;

        // Handle each cluster mode config differently
        this.clusterConfig = this.generateDefaults(config);

        // Ensure connections are happening over TLS
        this.ensureTlsConfig();

        // Ensure there is a prefix
        this.ensurePrefix();

        // // Register custom transformers
        // this.registerCustomTransformers();

        // Create a new redis client
        this.client = this.clusterConfig.clusterMode ?
            new Redis.Cluster([...this.clusterConfig.hostOptions ?? []], this.clusterConfig.clusterOptions) :
            new Redis(this.clusterConfig.redisOptions ?? {});

        // Register custom commands
        this.registerCustomCommands();

        // Create the pub-sub client
        const overrideOptions = {
            ...this.clusterConfig.redisOptions?.connectionName && {connectionName: `${this.clusterConfig.redisOptions.connectionName}-subscriber`},
        }
        this.subscriber = this.isClientClusterMode(this.client) ? this.client.duplicate([], overrideOptions) : this.client.duplicate(overrideOptions);

        // Register event listeners
        this.registerEventListeners(this.client);
        this.registerEventListeners(this.subscriber);

        // Add cluster mode warning
        //todo: Test cluster mode
        if (config.clusterMode) this.clusterConfig.pinoLogger?.warn("**WARNING** Using Redis in cluster mode has not been thoroughly tested.");
    }

    private isClientClusterMode(client: RedisClient): client is Cluster {
        return client.isCluster;
    }

    private isClusterMode(): boolean {
        return this.clusterConfig.clusterMode ?? false;
    }

    private isConfigClusterMode(config: Partial<RedisClusterConfig>): config is ClusterMode {
        return config.clusterMode ?? false;
    }

    /** Removed due to ioredis not supporting transformers on custom commands. Would need to transform `evalsha` command **/
    // private registerCustomTransformers() {
    //     // Set setIfLocked argument transformer
    //     Redis.Command.setArgumentTransformer("setIfLocked", (args: any[]) => {
    //         // Ensure the arguments are correct
    //         if (!is<SetIfLockedArgs>(args)) {
    //             this.clusterConfig.pinoLogger?.error(`Input args for "setIfLocked" not as expected, cannot execute command.`);
    //         }
    //
    //         // Grab the individual args
    //         const [lockKey, lockValue, key, value] = args as SetIfLockedArgs;
    //
    //         // Return the re-organized arguments
    //         return [lockKey, key, lockValue, value];
    //     });
    //
    //     // Set delIfLocked argument transformer
    //     Redis.Command.setArgumentTransformer("delIfLocked", (args: any[]) => {
    //         // Ensure the arguments are correct
    //         if (!is<DelIfLocked>(args)) {
    //             this.clusterConfig.pinoLogger?.error(`Input args for "delIfLocked" not as expected, cannot execute command.`);
    //         }
    //
    //         // Grab the individual args
    //         const [lockKey, lockValue, keys] = args as DelIfLocked;
    //
    //         // Return the re-organized arguments (with dynamic number of keys)
    //         return [keys.length + 1, lockKey, ...keys, lockValue];
    //     });
    // }


    private registerCustomCommands() {
        // Get lua script directory
        const scriptDir = dirname(fileURLToPath(import.meta.url)) + '/lua-scripts/';

        // Register setIfLocked
        this.client.defineCommand("setIfLocked", {
            numberOfKeys: 2,
            lua: fs.readFileSync(`${scriptDir}/set-if-locked.lua`, 'utf8'),
        });

        // Register delIfLocked
        this.client.defineCommand("delIfLocked", {
            lua: fs.readFileSync(`${scriptDir}/del-if-locked.lua`, 'utf8'),
        });
    }

    private generateDefaults(config: RedisClusterConfig) {

        // Extract configuration information from environment variables
        const username = (!isDev()) ? process.env["CLUSTER_REDIS_USERNAME"] : process.env["CLUSTER_REDIS_USERNAME_DEV"] ?? process.env["CLUSTER_REDIS_USERNAME"];
        const password = (!isDev()) ? process.env["CLUSTER_REDIS_PASSWORD"] : process.env["CLUSTER_REDIS_PASSWORD_DEV"] ?? process.env["CLUSTER_REDIS_PASSWORD"];
        const prefix = (!isDev()) ? process.env["CLUSTER_REDIS_PREFIX"] : process.env["CLUSTER_REDIS_PREFIX_DEV"] ?? process.env["CLUSTER_REDIS_PREFIX"];

        // Set the prefix variable
        if (prefix) config.prefix ??= prefix;

        const defaultHostOption = {
            ...process.env["CLUSTER_REDIS_HOST"] && {host: process.env["CLUSTER_REDIS_HOST"]},
            ...process.env["CLUSTER_REDIS_PORT"] && {port: +process.env["CLUSTER_REDIS_PORT"]},
            ...config.redisOptions?.host && {host: config.redisOptions.host},
            ...config.redisOptions?.port && {port: config.redisOptions.port}
        }

        // Add a default update interval
        config.credentialUpdateIntervalMins ??= this.CREDENTIALS_UPDATE_INTERVAL;

        // Create a host options if not already declared
        config.hostOptions ??= [defaultHostOption];

        // Check if we are disabling the redis cluster name
        const disableRedisClusterName = process.env["CLUSTER_REDIS_CLIENT_NAME_DISABLE"]?.toLowerCase() === "true";

        config.redisOptions = {
            ...defaultHostOption,
            ...username && {username: username},
            ...password && {password: password},
            ...!disableRedisClusterName && {connectionName: process.env["CLUSTER_REDIS_CLIENT_NAME"] ?? `keycloak-connector-${config.prefix}${this.uniqueClientId}`},
            reconnectOnError: (err) => {
                // Attempt to update credentials
                // Dev note: This is an async function, but there is no good way to make
                //  ioredis wait for new credentials to arrive. We'll just expect to keep failing
                //  until the credentials are updated.
                void this.updateCredentials();

                this.clusterConfig.pinoLogger?.error(`Redis connection error: ${err.message}`);

                return true;
                // // Reconnect on READONLY state to handle AWS ElastiCache primary replica changes
                // const targetError = "READONLY";
                // return err.message.includes(targetError);
            },
            ...!(process.env["CLUSTER_REDIS_DANGEROUSLY_DISABLE_TLS"]?.toLowerCase() === "true" || config.DANGEROUS_allowUnsecureConnectionToRedisServer) && {tls: {
                ...process.env["CLUSTER_REDIS_TLS_SNI"] && {servername: process.env["CLUSTER_REDIS_TLS_SNI"]},
            }},
            ...config.prefix && {keyPrefix: config.prefix},
            ...config.redisOptions,
            lazyConnect: true,
        }

        return config;
    }

    private queueCredentialsUpdate() {
        const updateIntervalMins = this.clusterConfig.credentialUpdateIntervalMins;
        if (updateIntervalMins === undefined || this.clusterConfig.credentialProvider === undefined) return;

        // Queue the next update
        this.clusterConfig.pinoLogger?.info(`Queuing credential update in ${updateIntervalMins} minutes`);

        setTimeout(
            async () => {
                await this.updateCredentials();
                await this.reAuthClients();
                this.queueCredentialsUpdate();
            },
            updateIntervalMins * 60 * 1000
        );
    }

    private async reAuthClients() {

        const redisOptions = this.clusterConfig.redisOptions;
        if (redisOptions?.username === undefined || redisOptions?.password === undefined) return;

        this.clusterConfig.pinoLogger?.info(`Re-authenticating clients`);

        try {
            await this.client.auth(redisOptions.username, redisOptions.password);
            await this.subscriber.auth(redisOptions.username, redisOptions.password);
            this.clusterConfig.pinoLogger?.info(`Finished re-authenticating clients`);
        } catch (e) {
            this.clusterConfig.pinoLogger?.info(`Error re-authenticating clients`);
        }
    }

    private async updateCredentials() {

        // Check for a credential provider
        if (this.clusterConfig.credentialProvider === undefined) return;

        // Check if we are already updating credentials
        if (this.updatingCredentials !== undefined) return this.updatingCredentials;

        this.clusterConfig.pinoLogger?.info(`Updating credentials`);

        // Obtain a "lock"
        const lockPromise = deferredFactory<undefined>();
        this.updatingCredentials = lockPromise.promise;

        try {
            // Grab new credentials
            const credentialPromise = this.clusterConfig.credentialProvider();

            // Don't wait too long for the result
            const credentials = await promiseWaitTimeout(credentialPromise, this.MAX_CREDENTIALS_WAIT);

            // Check if we received any credentials (and we have at least one record in the resultant object)
            if (credentials === undefined || Object.values(credentials).every(value => value === undefined)) {
                this.clusterConfig.pinoLogger?.error(`Credential provider provided no credentials to Redis Cluster Provider`);
                return;
            }

            // Create an array of all the options objects we need to update
            const optionsToUpdate = [this.clusterConfig.redisOptions];

            // Grab the redis client options
            if (this.isClientClusterMode(this.client)) {
                optionsToUpdate.push(this.client.options.redisOptions);
            } else {
                optionsToUpdate.push(this.client.options);
            }

            // Grab the redis subscriber options
            if (this.isClientClusterMode(this.subscriber)) {
                optionsToUpdate.push(this.subscriber.options.redisOptions);
            } else {
                optionsToUpdate.push(this.subscriber.options);
            }

            // Update all options
            optionsToUpdate.forEach(options => {
                if (options === undefined) return;
                if (credentials.username) options.username = credentials.username;
                if (credentials.password) options.password = credentials.password;
            });

            this.clusterConfig.pinoLogger?.info(`Finished updating credentials`);

        } catch (e) {
            this.clusterConfig.pinoLogger?.error(`Failed to update credentials`);
            if (isObject(e)) this.clusterConfig.pinoLogger?.error(e);

        } finally {
            // Release the updating credentials "lock"
            lockPromise.resolve(undefined);
            this.updatingCredentials = undefined;
        }
    }

    private ensureTlsConfig() {
        // Ensure the connection is over TLS
        if (this.clusterConfig.redisOptions?.tls === undefined) {
            // Check for no dangerous override flag
            if (this.clusterConfig.DANGEROUS_allowUnsecureConnectionToRedisServer !== true && process.env["CLUSTER_REDIS_DANGEROUSLY_DISABLE_TLS"]?.toLowerCase() !== "true") {
                throw new Error(`Connection url does not not start with "rediss" disabling TLS connection to REDIS server. Will not connect via unsecure connection without override.`);
            }

            this.clusterConfig.pinoLogger?.warn("***DANGEROUS CONFIGURATION*** Connecting to REDIS server using unsecure connection!");
        }
    }

    private ensurePrefix(): void {

        // Check for a prefix
        if (this.clusterConfig.prefix !== undefined || process.env["CLUSTER_REDIS_NO_PREFIX"]?.toLowerCase() === "true") return;

        // No prefix, show a warning
        this.clusterConfig.pinoLogger?.warn("***CONFIRM CONFIGURATION***\n" +
            "It is highly recommended to set a prefix when using Redis in order to allow for easier permission management configuration.\n" +
            "Set CLUSTER_REDIS_PREFIX='your-prefix::'\n" +
            "Or to hide this message, set CLUSTER_REDIS_NO_PREFIX=true");

    }

    private registerEventListeners(client: RedisClient) {

        const isSubscriber = this.isClientClusterMode(client);
        const clientNameTag = isSubscriber ? "Subscriber" : "Client";

        // Register the event listeners
        client.on(RedisClusterEvents.READY, (msg: string) => {
            this.clusterConfig.pinoLogger?.info(`Redis ${clientNameTag} ready to use`);
            this.clusterConfig.pinoLogger?.debug(msg);
            this.setIsConnected(isSubscriber, true);
            this.emitEvent(RedisClusterEvents.READY, msg);
        });
        client.on(RedisClusterEvents.END, (msg: string) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} connection has been closed`);
            this.clusterConfig.pinoLogger?.error(msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(RedisClusterEvents.END, msg);
        });
        client.on(RedisClusterEvents.ERROR, (msg: string) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} cluster error`);
            this.clusterConfig.pinoLogger?.error(msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(BaseClusterEvents.ERROR, msg);
            if (isSubscriber) this.connectionData.subscriberHadToReconnect = true;
        });
        client.on(RedisClusterEvents.RECONNECTING, (msg: string) => {
            this.clusterConfig.pinoLogger?.error(`Redis ${clientNameTag} is attempting to reconnect to the server`);
            this.clusterConfig.pinoLogger?.error(msg);
            this.setIsConnected(isSubscriber, false);
            this.emitEvent(RedisClusterEvents.RECONNECTING, msg);
        });
        client.on("message", this.handlePublishMessage);

    }

    async connectOrThrow(): Promise<true> {

        this.clusterConfig.pinoLogger?.debug(`Connecting to redis server`);

        const maxAttempts = 5;
        const baseDelayMs = 300;

        const retry = async (fn: () => Promise<void>, name: string) => {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await fn();
                    return;
                } catch (e) {
                    const errMsg = `${name} failed to connect to redis (attempt ${attempt}/${maxAttempts})`;

                    if (attempt === maxAttempts) {
                        if (isObject(e)) this.clusterConfig.pinoLogger?.error(e);
                        this.clusterConfig.pinoLogger?.error(errMsg);
                        throw new Error(errMsg);
                    }

                    await sleep(baseDelayMs * attempt, 300);
                }
            }
        };


        await retry(() => this.client.connect(), "Client");
        await retry(() => this.subscriber.connect(), "Subscriber");

        return true;
    }

    private setIsConnected(isSubscriber: boolean, connected: boolean) {
        if (isSubscriber) {
            this.connectionData.subscriberConnected = connected;
        } else {
            this.connectionData.clientConnected = connected;
        }

        // Check if the subscriber had to reconnect at some point and both client & subscriber are now fully connected
        if (this.connectionData.subscriberHadToReconnect && this.connectionData.clientConnected && this.connectionData.subscriberConnected) {
            this.emitEvent(BaseClusterEvents.SUBSCRIBER_RECONNECTED, Date.now()/1000);
            this.connectionData.subscriberHadToReconnect = false;
        }
    }

    override isConnected(isSubscriber: boolean): boolean {
        return (isSubscriber) ? this.connectionData.subscriberConnected : this.connectionData.clientConnected;
    }

    async disconnect(): Promise<boolean> {
        this.clusterConfig.pinoLogger?.debug(`Disconnecting from redis server`);

        try {
            this.client.disconnect();
        } catch (e) {
            if (isObject(e)) this.clusterConfig.pinoLogger?.error(e);
            this.clusterConfig.pinoLogger?.error(`Failed to disconnect from redis cluster`);
            return false;
        }

        try {
            this.subscriber.disconnect();
        } catch (e) {
            if (isObject(e)) this.clusterConfig.pinoLogger?.error(e);
            this.clusterConfig.pinoLogger?.error(`Failed to disconnect from redis cluster`);
            return false;
        }

        return true;
    }

    private channel(channel: string) {
        return `${this.clusterConfig.prefix}${channel}`;
    }

    private handlePublishMessage = (channelName: string, message: string): void => {
        // Broadcast the message
        this.subscriptionListeners.emit(`${this.SUB_EVENT_PREFIX}${channelName}`, message);
    }

    async handleSubscribe(channel: string, listener: Listener): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        try {
            // Subscribe if not subscribed already
            if (this.subscriptionListeners.listenerCount(`${this.SUB_EVENT_PREFIX}${channelName}`) === 0) {
                this.clusterConfig.pinoLogger?.debug(`Subscribing to ${channelName}`);
                await this.subscriber.subscribe(channelName);
            }

            // Store original listener
            this.subscriptionListeners.addListener(`${this.SUB_EVENT_PREFIX}${channelName}`, listener);

            return true;
        } catch (e) {
            if (isObject(e)) this.clusterConfig.pinoLogger?.debug(e);
            this.clusterConfig.pinoLogger?.debug(`Failed to subscribe to ${channelName}`);
            return false;
        }
    }

    async handleUnsubscribe(channel: string, listener: Listener): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        try {

            // Remove listener from store
            this.subscriptionListeners.removeListener(`${this.SUB_EVENT_PREFIX}${channelName}`, listener);

            // Unsubscribe if no more listeners
            if (this.subscriptionListeners.listenerCount(`${this.SUB_EVENT_PREFIX}${channelName}`) === 0) {
                this.clusterConfig.pinoLogger?.debug(`Unsubscribing from ${channelName}`);
                await this.subscriber.unsubscribe(channelName);
            }

            return true;
        } catch (e) {
            if (isObject(e)) this.clusterConfig.pinoLogger?.debug(e);
            this.clusterConfig.pinoLogger?.debug(`Failed to unsubscribe from ${channelName}`);
            return false;
        }
    }

    protected async handlePublish(channel: string, message: string): Promise<boolean> {

        // Grab the full channel name
        const channelName = this.channel(channel);

        try {
            this.clusterConfig.pinoLogger?.debug(`Publishing message to ${channelName}`);
            await this.client.publish(channelName, message);
            return true;
        } catch (e) {
            if (isObject(e)) this.clusterConfig.pinoLogger?.debug(e);
            this.clusterConfig.pinoLogger?.debug(`Failed to publish message to ${channelName}`);
            return false;
        }
    }

    async get(key: string): Promise<string | null> {
        this.clusterConfig.pinoLogger?.debug(`Getting value of key ${this.clusterConfig.prefix}${key}`);
        return this.client.get(key);
    }

    async store(key: string, value: string | number | Buffer, ttl: number | null, lockKey?: string): Promise<boolean> {

        this.clusterConfig.pinoLogger?.debug(`Setting value of key ${this.clusterConfig.prefix}${key}`);

        // Ensure ttl is an integer
        if (ttl) ttl = Math.ceil(ttl);

        let promise;
        if (lockKey) {
            // Build the options
            const options = {
                ...ttl !== null && { EX: ttl },
            }

            // Convert option into JSON
            const optionsJson = JSON.stringify(options);

            promise = this.client.setIfLocked(lockKey, key, this.uniqueClientId, value, optionsJson);
        } else {
            // Note: Typescript cannot properly infer the arguments due to the ridiculous overloading ioredis does, so we must specify each call individually...
            promise = (ttl) ?
                this.client.set(key, value, "EX", ttl) :
                this.client.set(key, value);
        }

        return (await promise !== null);
    }

    async remove(key: string, lockKey?: string): Promise<boolean> {
        this.clusterConfig.pinoLogger?.debug(`Deleting value of key ${this.clusterConfig.prefix}${key}`);
        const promise = (lockKey) ?
            this.client.delIfLocked(2, lockKey, key, this.uniqueClientId) :
            this.client.del(key);
        return (await promise !== null);
    }

    async lock(lockOptions: LockOptions, force?: boolean): Promise<boolean> {
        /**
         * Be warned: This lock implementation does not guarantee safety and liveness in
         * distributed cluster systems. Read more: https://redis.io/docs/manual/patterns/distributed-locks/
         */

        this.clusterConfig.pinoLogger?.debug(`Attempting to obtain a lock with key ${lockOptions.key}`);

        // Ensure ttl is an integer
        lockOptions.ttl = Math.ceil(lockOptions.ttl);

        let result;

        // Check for a force lock
        if (force) {
            // Set a key with our unique id
            result = await this.client.set(lockOptions.key, this.uniqueClientId, "EX", lockOptions.ttl);
        } else {
            // Set a key with our unique id IFF the key does not exist already
            result = await this.client.set(lockOptions.key, this.uniqueClientId, "EX", lockOptions.ttl, "NX");
        }

        const hasLock = (result !== null);
        this.clusterConfig.pinoLogger?.debug(`Lock was${hasLock ? '': ' not'} obtained`);

        return hasLock;
    }

    async unlock(lockOptions: LockOptions, force?: boolean): Promise<boolean> {
        const lockKey = (force) ? undefined : lockOptions.key;
        const result = await this.remove(lockOptions.key, lockKey);

        return (result !== null);
    }

    static async init(config: RedisClusterConfig = {}) {
        // Create a new instance of the cluster provider
        const redisClusterProvider = new RedisClusterProvider(config);

        // Update the credentials using a credential provider
        await redisClusterProvider.updateCredentials();

        // Queue the credential updates
        redisClusterProvider.queueCredentialsUpdate();

        // Return the new cluster provider
        return redisClusterProvider;

    }
}

export const redisClusterProvider = (config?: RedisClusterConfig) => RedisClusterProvider.init(config);
