# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.2] - 2025-04-20

### Fixed

- Base64 polyfill corrected

## [3.0.1] - 2025-04-20

### Fixed

- Corrected import and silent iframe handling

## [3.0.0] - 2025-04-20

### Fixed

- Corrected base64 encode/decode function

## [3.0.0] - 2025-04-18

### Fixed

- Better handling of eager access token refreshing
- Correctly removed listener iframe once login sequence finished
- More robust iframe generation

## [1.3.1] - 2025-01-23

### Fix

- Small logic fix to correct background login handling

## [1.3.0] - 2025-01-16

### Added

- Added option to specify redirect uri on logout

## [1.2.1] - 2024-12-30

### Fixed

- Fixed race condition caused by race between iframe source code sending parent window a message before iframe onload function was called

## [1.2.0] - 2024-12-30

### Added

- Handles errors from silent login and silent login listener, displaying useful messages and ui actions to the user

## [1.1.9] - 2024-12-30

### Fixed

- Issue where a user's access and refresh tokens were both expired, but the client did not attempt to do a background loginAdded `hasInvalidTokens` to allow for developers to show a persistent popup informing the user they are unauthenticated

## [1.1.5] - 2024-08-16

### Fixed

- Fixed `eagerRefreshTime` timeout usage

## [1.1.4] - 2024-08-16

### Fixed

- Fixed `eagerRefreshTime` calculations

## [1.1.3] - 2024-08-15

### Fixed

- Corrected rate limit function
- Added `alertEndpointOpts` to allow for customization

## [1.1.2] - 2024-08-15

### Changed

- Corrected log verbiage for eager refreshes

## [1.1.1] - 2024-08-15

### Fixed

- Fixed to ensure timeout is not less than 15 seconds

## [1.1.0] - 2024-08-15

### Added

- Added `eagerRefreshTime` enabling earlier access token refreshes prior to expiration
- Added endpoint alerting of user status updates via `alertEndpoint`

## [1.0.9] - 2023-12-22

### Fixed

- Improved fast auth checking to include a background check as well

## [1.0.7] - 2023-12-22

### Fixed

- Fixed issue where a client could be destroyed but still attempt to authorize

## [1.0.0] - 2023-12-03

### Added

- First major release ready for publishing
