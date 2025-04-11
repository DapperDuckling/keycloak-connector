import type {ConnectorKeys, Listener} from "../types.js";
import type {JWK} from "jose";
import * as jose from "jose";
import type {GenerateKeyPairOptions} from "jose/dist/types/key/generate_key_pair.js";
import {KeycloakConnector} from "../keycloak-connector.js";
import {webcrypto} from "crypto";
import type {Logger} from "pino";
import {is} from "typia";
import {AbstractClusterProvider} from "../cluster/abstract-cluster-provider.js";
import {setImmediate} from "timers";

export type KeyProviderConfig = {
    pinoLogger?: Logger,
    clusterProvider?: AbstractClusterProvider,
}

export abstract class AbstractKeyProvider {

    protected keyProviderConfig: KeyProviderConfig;
    protected connectorKeys: ConnectorKeys | null = null;
    protected onActiveKeyUpdate: Listener<Promise<void>> | null = null;
    protected updateOidcServer: Listener<Promise<void>> | (() => boolean) = () => this.initPendingOidcServerUpdate = true;
    private initPendingOidcServerUpdate = false;

    protected constructor(keyProviderConfig: KeyProviderConfig) {
        // Update the pino logger
        if (keyProviderConfig.pinoLogger) keyProviderConfig.pinoLogger = keyProviderConfig.pinoLogger.child({"Source": "KeyProvider"});

        // Save the provider configuration
        this.keyProviderConfig = keyProviderConfig;
    };

    protected abstract generateKeys(): Promise<ConnectorKeys>;

    public triggerKeySync(): void {
        // Defaults to no-op
        this.keyProviderConfig.pinoLogger?.info("No sync keys override provided, unable to sync keys.");
    }

    public async getActiveKeys(): Promise<ConnectorKeys> {
        // Get existing keys or generate & save then return new keys
        return this.connectorKeys ?? (this.connectorKeys = await this.generateKeys());
    }

    public abstract getPublicKeys(): Promise<JWK[]>;

    protected isConnectorKeys = (obj: unknown): obj is ConnectorKeys => is<ConnectorKeys>(obj);

    protected static async createKeys(alg: string = KeycloakConnector.REQUIRED_ALGO, options?: GenerateKeyPairOptions): Promise<ConnectorKeys> {

        // Generate a new key pair
        const keyPair = await jose.generateKeyPair(alg, options ?? {
            extractable: true
        });

        // Create the key id
        const keyId = `kcc-signing-${Date.now()}-${webcrypto.randomUUID()}`;

        const extraProps = {
            use: 'sig',
            alg: alg,
            kid: keyId,
        }

        const publicJwk = {
            ...extraProps,
            ...await jose.exportJWK(keyPair.publicKey),
        };

        const privateJwk = {
            ...extraProps,
            ...await jose.exportJWK(keyPair.privateKey),
        };

        // Build a connector keys object
        return {
            kid: keyId,
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            publicJwk,
            privateJwk,
        };
    }

    public registerCallbacks(onActiveKeyUpdate: Listener<Promise<any>>, updateOidcServer: Listener<Promise<any>>) {
        this.onActiveKeyUpdate = onActiveKeyUpdate;
        this.updateOidcServer = updateOidcServer;

        // Check if we have a pending oidc update
        // (this patches a race condition caused on initial startup)
        if (this.initPendingOidcServerUpdate) {
            setImmediate(this.onActiveKeyUpdate);
        }
    }
}