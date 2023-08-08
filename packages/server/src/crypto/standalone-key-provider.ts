import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {ConnectorKeys} from "../types.js";
import type {KeyLike} from "jose";
import type {GenerateKeyPairResult} from "jose";
import * as jose from "jose";
import {KeycloakConnector} from "../keycloak-connector.js";
import {webcrypto} from "crypto";

export class StandaloneKeyProvider extends AbstractKeyProvider {

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