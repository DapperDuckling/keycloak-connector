import React, {type ReactNode, useState} from 'react';
import {
    type ClientConfig, ClientEvent,
    keycloakConnectorClient
} from "@dapperduckling/keycloak-connector-client";
import {Authorization} from "./Authorization.js";
import {
    initialContext,
    KeycloakConnectorContext,
} from "../keycloak-connector-context.js";
import {KccDispatch, reducer} from "../reducer.js";
import {useImmerReducer} from "use-immer";


interface ConnectorProviderProps {
    children: ReactNode,
    config: ClientConfig,
    disableAuthComponent?: boolean
}

export const KeycloakConnectorProvider = ({ children, config, disableAuthComponent}: ConnectorProviderProps) => {

    const [kccContext, kccDispatch] = useImmerReducer(reducer, initialContext);

    useState(() => {
        // Instantiate the keycloak connector client
        const kccClient = keycloakConnectorClient(config);

        // Store the client in the context
        kccDispatch({type: KccDispatch.SET_KCC_CLIENT, payload: kccClient});

        // Attach handler
        let lengthyLoginTimeout: undefined | number = undefined;
        kccClient.addEventListener('*', (event) => {
            kccDispatch({type: KccDispatch.KCC_CLIENT_EVENT, payload: event});

            // Capture silent login events and set a timer to flag them as lengthy
            if (event.type === ClientEvent.START_SILENT_LOGIN) {
                clearTimeout(lengthyLoginTimeout);
                lengthyLoginTimeout = window.setTimeout(() => {
                    kccDispatch({type: KccDispatch.LENGTHY_LOGIN});
                }, 7000);
            }
        });

        // Initialize the connector
        kccClient.start();

    });

    return (
        <KeycloakConnectorContext.Provider value={kccContext}>
            <>
                {disableAuthComponent !== true && <Authorization />}
                {children}
            </>
        </KeycloakConnectorContext.Provider>
    );
};


