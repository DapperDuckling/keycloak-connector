import Provider from 'oidc-provider';

const configuration = {
    clients: [
        {
            client_id: 'keycloak-connector-dev',
            token_endpoint_auth_method: 'private_key_jwt',
            redirect_uris: ['http://localhost:3005/auth/callback*'],
            response_types: ['code'],
            grant_types: ['authorization_code', 'client_credentials', 'refresh_token'],
            client_name: 'Keycloak Connector',
            jwks_uri: 'http://localhost:3005/auth/k-jwks',
            id_token_signed_response_alg: 'PS256',
            userinfo_signed_response_alg: 'PS256',
            authorization_signed_response_alg: 'PS256',
            introspection_signed_response_alg: 'PS256'
        },
    ],
    issueRefreshToken: () => true,
    jwks: {
        "keys": [
            {
                "kty": "RSA",
                "n": "6AbDN4OyXECqN3HpEdr7nrHE96Z6UPts1kB66GxeiAfl-E6CUSAiDcF7d8FUvuaiVvSgq5vYNb-N1ILK3O5otCLVqS65yFd7XCNQjcfFPhmv7be1l_i1dxKix8RTMaA-H9BkU6jmLsFkB2T88r4X6QzCw6zdUbDr0jeLgciPCtGhNK1QzlgZrcHXKeIKWDCg-lCD0bJ0rYdTUPlbS4l248xBfa_pNYaNkNurlNOtsiurp0F1tWosvUovPpBybCuwP8ril3DZOJq3FYK4fa6AYaNSYy-xerGOOZk5486OH_YXfXZHlON7vw3dO8JHB7pstDW63gGjPWs32KXba_xKGw",
                "e": "AQAB",
                "d": "P-YQ4BqARcC3P-K6haTRk-AwNuWdnOzJCe4jCxxBImROdIYmhHH9ft1Qg-f1z0cT4S-oieo27oJs7GACvzpXEnjfb6LDHkXdXsAJAKrKCrKnTSfBNnOTghHbS3mpUaroQPmyj4mdrrWqtxCcSruIOTG-94WFQ-id4TxTyq-xmRAg2LwrXBF7V1fO_Ytw0VtXUjJZKq_4ynA3sUmrOSZyB4qN4hKG36qBCf9eUtXijgVpMHYvuHbG5Vx2HTGBg1FqDm_KH7efnbwy5ni3ym2ryW5tZILbYMb2uUm2MnDYZbF816cqxB9E-YvhQ2r8xXhKwHMOU9tlniB0q1YKApMLeQ",
                "p": "_7czzeJnz8LBKSzpIlEpzYjd8kxotXSIaTPtvvtw8FIsgIlNL8Am9tNV9EC6LBEBkCzXs78h7olpCHQf-hoPFhGoeTecVSz9HQJgPQ1IKUzrH5G1_eYje9LnOyWe7XQ7MgKi_2fnxwLj48oY7yFBcbG5acTUpYm8kvKPlcGQFTk",
                "q": "6EjQ-cmNQA40ienKFj-3xqYNuNwHRE_7Fw4ut0IJfPH3uyiemIyCXXcdPxLZqmyQR2ElZTB-TqsXSs8RlxwQimGf4ejvsdj3mPHX2W1i3n6CBKLSFzbD9sgFDox_tnpp9kO6OE6KxYY-2x8XxS56Dis7XUMqD_h1myZ1SS6GTfM",
                "dp": "6MLTrsY1BFIcDOTKWOhUCrhYfmK6tOCcAla4Q60QAlBqHZ3c2mgnj2iSxr_cNpxMNfX7aavCsSP2rTE2oiryLH5qQdwyuv02cB9nhmr-kklng9bYN4IyLlWtEJOP9EhmUYFA6QalXOrukLu2soQs09aYFQSLIxsawQ91TzVfd1E",
                "dq": "xOXchrBL1I12CaWskPmIDZJ6tUWFv2lQvTVfciY_JrNxPCvtbABHDXVHzExtR-Jo1qjJayIVHxg2UUp_bajzeGnSfkvWytnQ38u5HWx0z4dLLSTbk6PvrwPUDYYZSBQyN_cnJk2lolPueg28N3_zJImO87pYMFt7TX3nE5alb_M",
                "qi": "IosdMLzN4-ie2WiL-IM7qAnRA1onR4wN_X7qwEF6jYeI55GwIQuSSXE0DqUvFrfWKzGP71Cp-pizqDP9rvHYNMmEoS8NpK92xLrRuV8g7QTmdF5hJzjdUB8ujDAfwDMvNUpco1uSWnG_viAwOIElVnto_u0xQlKCvZfBSGO--Xc",
                "alg": "PS256",
                "use": "sig",
                "kid": "dev-key"
            }
        ]
    }
    ,
    features: {
        clientCredentials: { enabled: true },
        introspection: { enabled: true },
        revocation: { enabled: true },
        jwtResponseModes: { enabled: true },
        jwtIntrospection: { enabled: true },
        jwtUserinfo: { enabled: true },
        devInteractions: { enabled: true },
    },

    clientAuthMethods: ['private_key_jwt'],
    enabledJWA: {
        clientAuthSigningAlgValues: ['PS256'],
    },
};

const oidc = new Provider('http://localhost:12000', configuration);

// Start OIDC provider
const port = 12000;
oidc.listen(port, () => {
    console.log(
        `oidc-provider listening on port ${port}, check http://localhost:${port}/.well-known/openid-configuration`,
    );
});
