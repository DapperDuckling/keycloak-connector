---
sidebar_position: 1
---

# Why Keycloak Connector

Developing auth solutions distracts teams from their real purpose. Keycloak Connector follows the financial-grade API for you and ensures you're up to speed on the latest in best practices.  

## Features

### User Experience
- Access token expired? No problem, token refresh handled silently.
- Refresh token expired? No problem, token generation handled silently, if possible. Otherwise, user login flows ensure a non-destructive experience.
- 

### Scaling
- Keycloak connector comes ready to adapt to any clustering solution you can dream of.
- Out of the box Redis support allows you to host numerous instances of your backend, while keeping everything in sync.

### Caching
- Bring your own caching solution, Keycloak connector is built to interface with it.
- Out of the box Redis support, reducing amount of calls to your keycloak server and, ultimately, reducing system request handling latency.

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

### What you'll need

- [Node.js](https://nodejs.org/en/download/) version 18.0 or above
- Keycloak version 16.0 or above

[//]: # (Todo: link this to the keycloak docker container)

## Setup Keycloak

Following FAPI guidance, several changes to your Keycloak configuration may be required.

[//]: # (todo: Show the list of changes)

### Client Configuration

```
- Step 1
- Step 2
```

### Realm Configuration

```
- Step 1
- Step 2
```

## Setup Express

[//]: # (update this with a link to the supported servers page)
_Using a different server? See our [other supported servers.](/supported-servers)_

Keycloak connector server is an auth middleware that sits between end-user requests and your secure routes.

```js
import express from 'express';
import {keycloakConnectorExpress, lock} from "@dapperduckling/keycloak-connector-server";
import cookieParser from "cookie-parser"

const serverPort = 3005;

// Grab express app
const app = express();

// Register the cookie parser
app.use(cookieParser());

// Initialize keycloak connector server
await keycloakConnectorExpress(app, {
  clientId: 'keycloak-connector-example',
  clientSecret: 'PASSWORD_ONLY_USED_IN_DEV',    // A password is not allowed in non-dev environments
  serverOrigin: `http://localhost:${serverPort}`,
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

**App.jsx**

```jsx
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

**Content.jsx**

```jsx
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
