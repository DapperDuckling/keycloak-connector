import { generateKeyPair } from 'jose';
import { exportJWK } from 'jose/key/export';

const { privateKey } = await generateKeyPair('PS256', {
    extractable: true,
});

const jwk = await exportJWK(privateKey);
jwk.alg = 'PS256';
jwk.use = 'sig';
jwk.kid = 'dev-key'; // optionally unique identifier

const jwks = {
    keys: [jwk],
};

console.log(JSON.stringify(jwks, null, 2));
