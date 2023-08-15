import {AbstractKeyProvider} from "./abstract-key-provider.js";
import type {KeyProvider} from "../types.js";
import type {KeyProviderConfig} from "../types.js";

class StandaloneKeyProvider extends AbstractKeyProvider {
    static async factory() {
        return new StandaloneKeyProvider();
    }
}

export const standaloneKeyProvider: KeyProvider = async () => StandaloneKeyProvider.factory();