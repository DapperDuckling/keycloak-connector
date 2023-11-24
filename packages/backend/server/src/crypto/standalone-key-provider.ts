import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {KeyProviderConfig} from "./abstract-key-provider.js";
import type {ConnectorKeys, KeyProvider} from "../types.js";
import type {JWK} from "jose";

class StandaloneKeyProvider extends AbstractKeyProvider {

    protected generateKeys(): Promise<ConnectorKeys> {
        return AbstractKeyProvider.createKeys();
    }

    public async getPublicKeys(): Promise<JWK[]> {
        return (this.connectorKeys?.publicJwk) ? [this.connectorKeys.publicJwk] : [];
    }

    static async factory(keyProviderConfig: KeyProviderConfig) {
        return new StandaloneKeyProvider(keyProviderConfig);
    }
}

export const standaloneKeyProvider: KeyProvider = async (keyProviderConfig: KeyProviderConfig) => StandaloneKeyProvider.factory(keyProviderConfig);