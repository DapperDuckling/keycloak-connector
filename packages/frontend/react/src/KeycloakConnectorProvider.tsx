import React, { createContext, useContext, type ReactNode } from 'react';
import type {UserStatus} from "@dapperduckling/keycloak-connector-common";
import {
    type ClientConfig,
    type KeycloakConnectorClient,
    keycloakConnectorClient
} from "@dapperduckling/keycloak-connector-client";
import {Authorization} from "./Authorization.js";

interface ConnectorContextProps {
    userStatus: UserStatus,
    kcc: KeycloakConnectorClient,
    start: KeycloakConnectorClient['start'],
}

interface ConnectorProviderProps {
    children: ReactNode,
    config: ClientConfig,
    disableAuthComponent?: boolean
}

const KeycloakConnectorContext = createContext<ConnectorContextProps | undefined>(undefined);

export const KeycloakConnectorProvider = ({ children, config, disableAuthComponent}: ConnectorProviderProps) => {

    // Instantiate the keycloak connector client
    const kcc = keycloakConnectorClient(config);

    // Attach handlers
    //todo:
    // kcc.attachHandlers();


    const connectorContext: ConnectorContextProps = {
        userStatus: {
            userInfo: undefined,
            loggedIn: false,
        },
        kcc: kcc,
        start: kcc.start,
    }

    return (
        <KeycloakConnectorContext.Provider value={connectorContext}>
            <>
                {disableAuthComponent !== true && <Authorization />}
                {children}
            </>
        </KeycloakConnectorContext.Provider>
    );
};

export const useKeycloakConnector = (): ConnectorContextProps => {
    const context = useContext(KeycloakConnectorContext);
    if (!context) {
        throw new Error('useKeycloakConnector must be used within a KeycloakConnectorProvider');
    }
    return context;
};

