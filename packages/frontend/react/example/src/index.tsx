import React from 'react'
import ReactDOM from 'react-dom/client'
import {KeycloakConnectorProvider} from "@dapperduckling/keycloak-connector-react";
import { Content } from './content.js';
import { DapperDucklingLoginChild } from './DapperDucklingLoginChild.js';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <React.StrictMode>
  <KeycloakConnectorProvider config={{
      client: {
          apiServerOrigin: "http://localhost:3005",
      },
      react: {
          loginModalChildren: <DapperDucklingLoginChild />,
      }
    }}>
      <Content />
  </KeycloakConnectorProvider>
  </React.StrictMode>,
)
