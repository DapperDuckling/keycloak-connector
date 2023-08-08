import type {ConnectorKeys} from "../types.js";
import type {GenerateKeyPairResult} from "jose";
import * as jose from "jose";
import type {GenerateKeyPairOptions} from "jose/dist/types/key/generate_key_pair.js";

export abstract class AbstractKeyProvider {

    private static connectorKeys: ConnectorKeys | null = null;

    protected abstract generateKeys(): Promise<ConnectorKeys>;

    public async getKeys(): Promise<ConnectorKeys> {
        // Get existing keys or generate & save then return new keys
        return AbstractKeyProvider.connectorKeys ?? (AbstractKeyProvider.connectorKeys = await this.generateKeys());
    }

    protected async generateKeyPair(alg: string, options?: GenerateKeyPairOptions): Promise<GenerateKeyPairResult> {
        return await jose.generateKeyPair(alg, options);
    }
}