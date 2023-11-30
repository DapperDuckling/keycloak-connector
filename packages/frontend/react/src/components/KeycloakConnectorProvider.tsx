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
    KeycloakConnectorDispatchContext,
} from "../keycloak-connector-context.js";
import {KccDispatchType, reducer} from "../reducer.js";
import {useImmerReducer} from "use-immer";
import {Button, createTheme, ThemeProvider} from "@mui/material";
import {Logout} from "./Logout.js";

interface ConnectorProviderProps {
    children: ReactNode,
    config: ClientConfig,
    disableAuthComponents?: boolean
}

const theme = createTheme({
    palette: {
        mode: "dark",
        primary: { main: "#ffffff" },
        // @ts-ignore
        grey: { main: "#7a7a7a" },
        darkgrey: { main: "#313131" },
        lightgrey: { main: "#B9B9B9" },
        lightblue: { main: "#79b4c3" },
        white: { main: "#fff" },
        black: { main: "#000" },
        red: { main: "#ff0000" },
    },
});

export const KeycloakConnectorProvider = ({ children, config, disableAuthComponents}: ConnectorProviderProps) => {

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
            <KeycloakConnectorDispatchContext.Provider value={kccDispatch}>
                {disableAuthComponents !== true &&
                    <ThemeProvider theme={theme}>
                        {/*Todo: Centralize common components */}
                        {kccContext.showLoginOverlay && <Authorization />}
                        {kccContext.showLogoutOverlay && <Logout />}
                    </ThemeProvider>
                }
                <div>Wow5!</div>
                <Button onClick={() => {
                    kccDispatch({type: KccDispatchType.EXECUTING_LOGOUT});
                    kccContext.kccClient?.handleLogout();
                }}>Logout Now</Button>
                <Button onClick={() => kccDispatch({type: KccDispatchType.SHOW_LOGOUT})}>Show Logout Modal</Button>
                {children}
            </KeycloakConnectorDispatchContext.Provider>
        </KeycloakConnectorContext.Provider>
    );
};


