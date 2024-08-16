import React from 'react'
import ReactDOM from 'react-dom/client'
import {KeycloakConnectorProvider} from "@dapperduckling/keycloak-connector-react";
import { Content } from './content.js';
import {DarkSaberLoginChild} from "@dapperduckling/keycloak-connector-react-custom-darksaber";

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <React.StrictMode>
  <KeycloakConnectorProvider config={{
      client: {
          apiServerOrigin: "http://localhost:3005",
          fastInitialAuthCheck: true,
      },
      react: {
          loginModalChildren: <DarkSaberLoginChild />,
      }
    }}>
      <Content />
  </KeycloakConnectorProvider>
  </React.StrictMode>,
)
