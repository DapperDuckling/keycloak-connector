import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {ConnectorKeys, KeyProvider} from "../types.js";
import type {KeyProviderConfig} from "../types.js";

class StandaloneKeyProvider extends AbstractKeyProvider {
    static async factory(keyProviderConfig: KeyProviderConfig) {
        return new StandaloneKeyProvider(keyProviderConfig);
    }

    protected generateKeys(): Promise<ConnectorKeys> {
        return AbstractKeyProvider.createKeys();
    }
}

export const standaloneKeyProvider: KeyProvider = async (keyProviderConfig: KeyProviderConfig) => StandaloneKeyProvider.factory(keyProviderConfig);