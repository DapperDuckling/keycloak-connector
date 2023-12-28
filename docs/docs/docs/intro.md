---
sidebar_position: 1
---

# Getting Started

Let's discover **Keycloak Connector** in less than 10 minutes.

### What you'll need

- [Node.js 18.0+](https://nodejs.org/en/download/)
- [Keycloak 16.0+](https://www.keycloak.org/downloads)

#### Or experience it now with Docker

- Download [kcc-docker-jumpstart.zip](/assets/kcc-docker-jumpstart.zip), extract and run `docker up`.

## Getting Started

Get started by starting Keycloak and adding the following packages to an existing application.

#### Keycloak

  ```sh
  docker run quay.io/keycloak/keycloak start-dev
  ```

#### Frontend - React App

  ```sh
  npm i @dapperduckling/keycloak-connector-react
  ```

#### Backend - NodeJs Server

  ```sh
  npm i @dapperduckling/keycloak-connector-server 
  ```

[//]: # (todo: Update this with a nodejs in browser option)
Or **try Keycloak Connector immediately** with **[docusaurus.new](https://docusaurus.new)**.

## Setup Keycloak

Following FAPI guidance, several changes to your Keycloak configuration may be required.

[//]: # (todo: Show the list of changes)

### Client Configuration

```
- todo
```

### Realm Configuration

```
- todo
```

## Setup Express

[//]: # (update this with a link to the supported servers page)
[//]: # (_Using a different server? See our [other supported servers.]&#40;/supported-servers&#41;_)

Keycloak connector server is an auth middleware that sits between end-user requests and your secure routes.

```ts title="server.js"
import express from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser";

// Grab express app
const app = express();

// Register the cookie parser
app.use(cookieParser());

// Initialize keycloak connector server
await keycloakConnectorExpress(app, {
  clientId: 'keycloak-connector-example',
  clientSecret: 'PASSWORD_ONLY_USED_IN_DEV',    // A password is not allowed in non-dev environments
  serverOrigin: `http://localhost:3005`,
  authServerUrl: 'http://localhost:8080/',    // Your keycloak server here!
  realm: 'master',
});

// Register a public route on the app
app.get('/', (req, res) => {
  res.send('I am a public route and no authentication nor authorization is required to reach me.');
});

// Create a new router to secure all routes behind
const router = express.Router();

// Lock all routes in this router behind a login page
router.use(lock());

// Only authentication required route
router.get('/no-role-required', (req, res) => {
  res.send(`Since the router I'm attached to is uses 'lock()', this route only requires a user to login (authenticate) to access.`);
});

// Requires "COOL_GUY" role
router.get('/cool-guy', lock(['COOL_GUY']), (req, res) => {
  res.send(`This route requires an end-user to have the "COOL_GUY" role.`);
});

// Register the router with the app
app.use(router);

// Start the server
app.listen(3005, () => {
  console.log(`express :: listening`);
});
```

You can start and test this setup now! Head to a [protected route](http://localhost/no-role-required)

## Setup React

```jsx title="App.jsx"
import React from 'react'
import ReactDOM from 'react-dom/client'
import {KeycloakConnectorProvider} from "@dapperduckling/keycloak-connector-react";
import {Content} from "./content.js";

const root = ReactDOM.createRoot(document.getElementById('root'));

const keycloakConnectorConfig = {
  client: {
    // The backend NodeJs server
    apiServerOrigin: "http://loaclhost:3005"
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

## That's it!
