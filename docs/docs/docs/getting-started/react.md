---
sidebar_position: 2
---

# Adding React

After initial setup, you can drop in authentication for any React application with ease.

1. Install [Keycloak Connector React &#x2197;](https://www.npmjs.com/package/@dapperduckling/keycloak-connector-react)

    ```sh
    npm i @dapperduckling/keycloak-connector-react
    ```

2. Wrap your application with the `KeycloakConnectorProvider`
    ```jsx title="App.jsx"
    import React from 'react'
    import ReactDOM from 'react-dom/client'
    import {KeycloakConnectorProvider} from "@dapperduckling/keycloak-connector-react";
    import {Content} from "./content.js";
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    
    const keycloakConnectorConfig = {
      client: {
        // The backend NodeJs webserver
        apiServerOrigin: "http://loaclhost:3000"
      }
    }
    
    root.render(
      <React.StrictMode>
        <KeycloakConnectorProvider config={keycloanConnectorConfig}>
          <Content/>
        </KeycloakConnectorProvider>
      </React.StrictMode>
    )
    ```

```jsx title="Content.jsx"
export const Content = () => {
  const [kccContext] = useKeycloakConnector();
  return (
    <>
      <h2>You're using Keycloak Connector React</h2>
      <p>
        User login status:
        <span>{kccContext.userStatus.loggedIn ? 'Logged in!' : 'Logged out!'}</span>
      </p>
    </>
  );
}
```
