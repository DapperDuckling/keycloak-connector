import Provider from 'oidc-provider';

const configuration = {
    clients: [
        {
            client_id: 'keycloak-connector-dev',
            token_endpoint_auth_method: 'private_key_jwt',
            redirect_uris: ['http://localhost:3000/*'],
            response_types: ['code'],
            grant_types: ['authorization_code', 'client_credentials'],
            client_name: 'Keycloak Connector',
            jwks_uri: 'http://localhost:4000/api/k-jwks',
        },
    ],

    features: {
        clientCredentials: { enabled: true },
        introspection: { enabled: true },
        revocation: { enabled: true },
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
