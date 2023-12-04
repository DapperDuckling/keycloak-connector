import {type ReactNode, useLayoutEffect, useState} from 'react';
import {
    type ClientConfig, ClientEvent,
    keycloakConnectorClient
} from "@dapperduckling/keycloak-connector-client";
import {Login} from "./Login.js";
import {
    InitialContext,
    KeycloakConnectorContext,
    KeycloakConnectorDispatchContext,
} from "../keycloak-connector-context.js";
import {reducer} from "../reducer.js";
import {useImmerReducer} from "use-immer";
import {createTheme, ThemeProvider} from "@mui/material";
import {Logout} from "./Logout.js";
import {KccDispatchType} from "../types.js";

export type ReactConfig = {
    disableAuthComponents?: boolean,

    /**
     * @desc Specify a component to pass to the login modal for slight customization
     */
    loginModalChildren?: ReactNode;

    /**
     * @desc Specify a component to pass to the logout modal for slight customization
     */
    logoutModalChildren?: ReactNode;

    /**
     * Defer the start of the plugin
     */
    deferredStart?: boolean;
}

interface ConnectorProviderProps {
    children: ReactNode,
    config: {
        client: ClientConfig,
        react?: ReactConfig,
    },
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

export const KeycloakConnectorProvider = ({children, config}: ConnectorProviderProps) => {

    // Grab the initial context
    const initialContext = structuredClone(InitialContext);

    // Update for a deferred start
    if (config.react?.deferredStart) initialContext.ui.showLoginOverlay = false;

    // Initialize the reducer
    const [kccContext, kccDispatch] = useImmerReducer(reducer, initialContext);

    useState(() => {
        // Safety check for non-typescript instances
        if (config === undefined) {
            throw new Error("No config provided to KeycloakConnectorProvider");
        }

        // Instantiate the keycloak connector client
        const kccClient = keycloakConnectorClient(config.client);

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
        if (config.react?.deferredStart !== true) kccClient.start();
    });

    return (
        <KeycloakConnectorContext.Provider value={kccContext}>
            <KeycloakConnectorDispatchContext.Provider value={kccDispatch}>
                {config.react?.disableAuthComponents !== true &&
                    <ThemeProvider theme={theme}>
                        {kccContext.ui.showLoginOverlay && <Login {...config.react}>{config.react?.loginModalChildren}</Login>}
                        {kccContext.ui.showLogoutOverlay && <Logout {...config.react}>{config.react?.logoutModalChildren}</Logout>}
                    </ThemeProvider>
                }
                {children}
            </KeycloakConnectorDispatchContext.Provider>
        </KeycloakConnectorContext.Provider>
    );
};


