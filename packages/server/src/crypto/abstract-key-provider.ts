import type {ConnectorKeys} from "../types.js";
import type {GenerateKeyPairResult} from "jose";
import * as jose from "jose";
import type {GenerateKeyPairOptions} from "jose/dist/types/key/generate_key_pair.js";
import {KeycloakConnector} from "../keycloak-connector.js";
import {webcrypto} from "crypto";

export abstract class AbstractKeyProvider {

    private static connectorKeys: ConnectorKeys | null = null;

    protected constructor() {};

    public async getKeys(): Promise<ConnectorKeys> {
        // Get existing keys or generate & save then return new keys
        return AbstractKeyProvider.connectorKeys ?? (AbstractKeyProvider.connectorKeys = await this.generateKeys());
    }

    protected async generateKeyPair(alg: string, options?: GenerateKeyPairOptions): Promise<GenerateKeyPairResult> {
        return await jose.generateKeyPair(alg, options);
    }

    async generateKeys(): Promise<ConnectorKeys> {

        // Generate a new key pair
        const keyPair = await this.generateKeyPair(KeycloakConnector.REQUIRED_ALGO);

        const extraProps = {
            use: 'sig',
            alg: KeycloakConnector.REQUIRED_ALGO,
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
            privateJwk: privateJwk,
            publicJwk: publicJwk,
        };
    }
}