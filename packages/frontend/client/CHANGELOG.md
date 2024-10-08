# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
