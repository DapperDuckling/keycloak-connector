# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.2] - 2025-04-20

### Fixed

- Base64 polyfill corrected

## [3.0.1] - 2025-04-20

### Fixed

- Corrected silent iframe handling

## [3.0.0] - 2025-04-18

### Changed

- Significant core code and logic updated for parts touching the openid-client library to match OAuth 2.1 specifications
- Additional logic to retry syncing keys if the oidc provider reports issue with public key

### Deprecated

- `redirect_uris` and `post_logout_redirect_uris` for `redirectUris` and `postLogoutRedirectUris`

### Fixed

- Swapped cache provider logic to use deferred promise instead due to improper event listener usage
- Cache provider logic more robust to operate as intended
- Cluster key provider updated to interface with non-serializable keys 
- Backchannel logouts correctly clear cached user info

## [2.6.3] - 2025-02-25

### Fixed

- Fixed silent listener message passing to handle unsanitized input. Now base64 encodes the event data to ensure message is wrapped properly.

## [2.6.0] - 2024-12-26

### Added

- Allow customizing error responses by registering an `errorResponseHandler`

## [2.5.5] - 2024-11-25

### Fixed

- [Security] Resolved an issue in the authentication flow to improve input validation. Users are strongly encouraged to update to this version for enhanced security.

## [2.5.0] - 2024-09-16

### Added

- To Scott: for struggling with deploying this in his environment 

## [2.4.4] - 2024-09-03

### Fixed

- When a server is readonly, disabled `eagerRefreshTime` to prevent access token from failing early

## [2.4.3] - 2024-08-29

### Fixed

- Corrected throw to log during catch of failed user provided `decorateUserStatus` function

## [2.4.2] - 2024-08-29

### Fixed

- Ensured `kccUserData` was decorated with `userStatus` before calling user defined `decorateUserStatus` function

## [2.4.0] - 2024-08-29

### Added

- Decorated `kccUserData` with `userStatus` to pass data found at `/user-status` to the backend natively

## [2.3.1] - 2024-08-16

### Fixed

- Fixed `eagerRefreshTime` calculations

## [2.3.0] - 2024-08-15

### Added

- Added `eagerRefreshTime` enabling earlier access token refreshes prior to expiration

## [2.2.1] - 2024-07-26

### Fixed

- Cookie prefix typo provided false sense of security. Due to desire for subdomain-sharable configuration, moved to using `__SECURE-` prefix

## [2.2.0] - 2024-07-22

### Added

- Allows developers to decorate the `/user-status` endpoint and ultimately pass data to their frontend using the `decorateUserStatus` config

## [2.1.1] - 2024-07-16

### Fixed

- In dev mode when `localhost` is accessed, origin checks are bypassed which will result in the server crashing if the origin header is not sent

## [2.1.0] - 2024-06-03

### Added

- Added `wildcardCookieBaseDomain` to allow keycloak connector to share cookies with other subdomains off a shared base domain

## [2.0.0] - 2024-05-19

### Removed

- Requirement for `sid` claim

## [1.5.2] - 2024-05-19

### Removed

- Requirement for `auth_time` claim

## [1.5.0] - 2024-05-19

### Added

- Added option to verify audience claim instead of azp if it exists and matches what we expect

## [1.4.0] - 2024-04-30

### Added

- `req.kccBypass` to allow for upstream middleware packages to skip keycloak connector for the specific request

## [1.3.0] - 2024-04-29

### Added

- `genericAuthExpress` / `genericAuthFastify` to allow for simple authentication injections by developers (without having to build out an entire plugin)

## [1.2.3] - 2024-02-08

### Added

- `readOnlyServer`/`validateAccessOnly` to force a server to not attempt to refresh an invalid access token
- ~~Added option to override the authorization endpoint origin returned from the keycloak instance~~

## [1.1.2] - 2023-12-24

### Fixed

- Fixed logouts were prompting uses at keycloak still

## [1.1.1] - 2023-12-23

### Fixed

- Added plugin decorators to allow plugins to add properties to the request object

## [1.1.0] - 2023-12-23

### Added

- Added plugin decorators to allow plugins to add properties to the request object

### Fixed

- Cache provider unnecessarily re-attempting cache miss callback when no data was returned
- Resolved lock not getting released before attempting to gain another one

## [1.0.12] - 2023-12-19

### Fixed

- Login/logout html pages now show correct serve origin
- Non-localhost usage breaking after auth redirect from Keycloak

## [1.0.5] - 2023-12-04

### Fixed

- Applied fix with `postinstall` preventing use in other libraries

## [1.0.0] - 2023-12-03

### Added

- First major release ready for publishing
