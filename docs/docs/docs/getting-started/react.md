---
sidebar_position: 2
---

# Adding React

After initial setup, you can drop in authentication for any React application with ease.

#### Install [Keycloak Connector React](https://www.npmjs.com/package/@dapperduckling/keycloak-connector-react)
```sh
npm i @dapperduckling/keycloak-connector-react
```

#### Wrap your application with the `KeycloakConnectorProvider`
```jsx title="App.jsx"
import React from 'react'
import ReactDOM from 'react-dom/client'
import {KeycloakConnectorProvider} from "@dapperduckling/keycloak-connector-react";

const root = ReactDOM.createRoot(document.getElementById('root'));

const keycloakConnectorConfig = {
   client: {
     apiServerOrigin: "http://localhost:5000"   // The backend NodeJs webserver
   },
    react: {
        loginModalChildren: <DarkSaberLoginChild />, // Optional
        globalEventListener: handleKccEvent, // Optional
    }
}

root.render(
   <React.StrictMode>
     <KeycloakConnectorProvider config={keycloakConnectorConfig}>
        {/* Your existing app here */}
     </KeycloakConnectorProvider>
   </React.StrictMode>
);
```
