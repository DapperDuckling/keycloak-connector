import type {ConnectorKeys, KeyProviderConfig} from "../types.js";
import type {GenerateKeyPairResult} from "jose";
import * as jose from "jose";
import type {GenerateKeyPairOptions} from "jose/dist/types/key/generate_key_pair.js";
import {KeycloakConnector} from "../keycloak-connector.js";
import {webcrypto} from "crypto";
import type {Logger} from "pino";

export abstract class AbstractKeyProvider {

    private keyProviderConfig: KeyProviderConfig;
    protected connectorKeys: ConnectorKeys | null = null;

    protected constructor(keyProviderConfig: KeyProviderConfig) {
        // Update the pino logger
        if (keyProviderConfig.pinoLogger) keyProviderConfig.pinoLogger = keyProviderConfig.pinoLogger.child({"Source": "KeyProvider"});

        // Save the provider configuration
        this.keyProviderConfig = keyProviderConfig;
    };

    protected abstract generateKeys(): Promise<ConnectorKeys>;

    public async getKeys(): Promise<ConnectorKeys> {
        // Get existing keys or generate & save then return new keys
        return this.connectorKeys ?? (this.connectorKeys = await this.generateKeys());
    }

    private isConnectorKeys(keys: unknown): boolean {

    }

    protected static async createKeys(alg: string = KeycloakConnector.REQUIRED_ALGO, options?: GenerateKeyPairOptions): Promise<ConnectorKeys> {

        // Generate a new key pair
        const keyPair = await jose.generateKeyPair(alg, options);

        // Create the key id
        const keyId = `kcc-signing-${Date.now()}-${webcrypto.randomUUID()}`;

        const extraProps = {
            use: 'sig',
            alg: alg,
            kid: `kcc-signing-${Date.now()}-${webcrypto.randomUUID()}`,
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
            privateJwk: privateJwk,
            publicJwk: publicJwk,
        };
    }
}