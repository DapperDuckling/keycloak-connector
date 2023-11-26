// @ts-nocheck
import { useReducer } from 'react';

function reducer(state, action) {
    switch (action.type) {
        case 'incremented_age': {
            return {
                name: state.name,
                age: state.age + 1
            };
        }
        case 'changed_name': {
            return {
                name: action.nextName,
                age: state.age
            };
        }
    }
    throw Error('Unknown action: ' + action.type);
}

const initialState = { name: 'Taylor', age: 42 };
import React from 'react';
import {useState} from "react";

export const KeycloakConnectorProvider = () => {

    // const [state, setState] = useState({
    //     name: 'Taylor2',
    //     age: 42,
    // });
    const [state, dispatch] = useReducer(reducer, initialState);

    function handleButtonClick() {
        dispatch({ type: 'incremented_age' });
    }

    function handleInputChange(e) {
        dispatch({
            type: 'changed_name',
            nextName: e.target.value
        });
    }

    return (
        <div>
            <input
                value={state.name}
                onChange={handleInputChange}
            />
            <button onClick={handleButtonClick}>
                Increment age
            </button>
            <p>Hello13, {state.name}. You are {state.age}.</p>
        </div>
    );
}


// import React, {type ReactNode, useReducer, useState} from 'react';
// import {
//     type ClientConfig, ClientEvent,
//     keycloakConnectorClient
// } from "@dapperduckling/keycloak-connector-client";
// // import {Authorization} from "./Authorization.js";
// import {
//     // initialContext,
//     // KeycloakConnectorContext,
//     type KeycloakConnectorContextProps,
// } from "../keycloak-connector-context.js";
// import {KccDispatch, reducer} from "../reducer.js";
// import {useImmerReducer} from "use-immer";
//
//
// interface ConnectorProviderProps {
//     children: ReactNode,
//     config: ClientConfig,
//     disableAuthComponent?: boolean
// }
//
// // export const initialContext: KeycloakConnectorContextProps = {
// //     userStatus: {
// //         userInfo: undefined,
// //         loggedIn: false,
// //     },
// //     initiated: false,
// //     lengthyLogin: false,
// //     showLoginOverlay: true,
// //     silentLoginInitiated: false,
// //     showMustLoginOverlay: false,
// //     loginError: false,
// // }
//
// const todoReducer = (state, action) => {
//     switch (action.type) {
//         case 'DO_TODO':
//             return state.map(todo => {
//                 if (todo.id === action.id) {
//                     return { ...todo, complete: true };
//                 } else {
//                     return todo;
//                 }
//             });
//         case 'UNDO_TODO':
//             return state.map(todo => {
//                 if (todo.id === action.id) {
//                     return { ...todo, complete: false };
//                 } else {
//                     return todo;
//                 }
//             });
//         default:
//             return state;
//     }
// };
//
// export const KeycloakConnectorProvider = ({ children, config, disableAuthComponent}: ConnectorProviderProps) => {
//
//     // const [kccContext, kccDispatch] = useImmerReducer(reducer, initialContext);
//     // @ts-ignore
//     const [kccContext, kccDispatch] = useReducer(reducer, initialContext);
//
//     // useState(() => {
//     //     // Instantiate the keycloak connector client
//     //     const kccClient = keycloakConnectorClient(config);
//     //
//     //     // // Store the client in the context
//     //     // kccDispatch({type: KccDispatch.SET_KCC_CLIENT, payload: kccClient});
//     //     //
//     //     // // Attach handler
//     //     // let lengthyLoginTimeout: undefined | number = undefined;
//     //     // kccClient.addEventListener('*', (event) => {
//     //     //     kccDispatch({type: KccDispatch.KCC_CLIENT_EVENT, payload: event});
//     //     //
//     //     //     // Capture silent login events and set a timer to flag them as lengthy
//     //     //     if (event.type === ClientEvent.START_SILENT_LOGIN) {
//     //     //         clearTimeout(lengthyLoginTimeout);
//     //     //         lengthyLoginTimeout = window.setTimeout(() => {
//     //     //             kccDispatch({type: KccDispatch.LENGTHY_LOGIN});
//     //     //         }, 7000);
//     //     //     }
//     //     // });
//     //
//     //     // Initialize the connector
//     //     kccClient.start();
//     //
//     // });
//
//     return (
//         // <KeycloakConnectorContext.Provider value={kccContext}>
//             <>
//                 {/*{disableAuthComponent !== true && <Authorization />}*/}
//                 {children}
//             </>
//         // </KeycloakConnectorContext.Provider>
//     );
// };
//
//
