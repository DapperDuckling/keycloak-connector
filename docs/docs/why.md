---
sidebar_position: 1
---

# Why Keycloak Connector

Developing auth solutions distracts teams from their real purpose. Keycloak Connector follows the financial-grade API for you and ensures you're up to speed on the latest in best practices.  

## Features

### Security
- Founded on FAPI 2.0 OAuth
- Automatic asymmetric key rotation on the fly 

### Developer Experience
- Authorization and authentication that just works!
- Request decoration to provide backend code with user data and status
- `useKeycloakConnector()` provides user info to existing React applications

### User Experience
- Access token expired? No problem, token refresh handled silently.
- Refresh token expired? No problem, token generation handled silently, if possible. Otherwise, user login flows ensure a non-destructive experience.

### Scaling
- Keycloak connector comes ready to adapt to any clustering solution you can dream of.
- Out of the box Redis support allows you to host numerous instances of your backend, while keeping everything in sync.

### Caching
- Bring your own caching solution, Keycloak connector is built to interface with it.
- Out of the box Redis support, reducing amount of calls to your keycloak server and, ultimately, reducing system request handling latency.
