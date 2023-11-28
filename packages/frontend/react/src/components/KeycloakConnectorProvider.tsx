import {type ReactNode, useLayoutEffect, useReducer, useState} from 'react';
import React from "react";
import {
    type ClientConfig, ClientEvent,
    keycloakConnectorClient
} from "@dapperduckling/keycloak-connector-client";
import {Authorization} from "./Authorization.js";
import {
    initialContext,
    KeycloakConnectorContext,
    type KeycloakConnectorContextProps,
} from "../keycloak-connector-context.js";
import {KccDispatchType, reducer} from "../reducer.js";
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
        kccDispatch({type: KccDispatchType.SET_KCC_CLIENT, payload: kccClient});
    });

    useLayoutEffect(() => {

        // Grab the client
        const kccClient = kccContext.kccClient;

        if (!kccClient) {
            console.debug(`No client found`);
            return;
        }

        // Check if the client has already started
        if (kccClient.isStarted()) return;

        // Attach handler
        let lengthyLoginTimeout: undefined | number = undefined;

        kccClient.addEventListener('*', (clientEvent, payload) => {

            console.debug(`KCP received event: ${clientEvent}`);

            // Build a custom event
            const event = new CustomEvent(clientEvent, {detail: payload});

            // Dispatch the event
            kccDispatch({type: KccDispatchType.KCC_CLIENT_EVENT, payload: event});

            // Capture silent login events and set a timer to flag them as lengthy
            if (event.type === ClientEvent.START_SILENT_LOGIN) {
                clearTimeout(lengthyLoginTimeout);
                lengthyLoginTimeout = window.setTimeout(() => {
                    kccDispatch({type: KccDispatchType.LENGTHY_LOGIN});
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
                <div>Wow5!</div>
                {children}
            </>
        </KeycloakConnectorContext.Provider>
    );
};


