# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2025-04-18

### Changed

- Typing name change `UserStatus` -> `UserStatusImmerSafe` to match new openid-client types

## [1.2.3] - 2024-12-30

### Fixed

- Rollback 1.2.2

## [1.2.2] - 2024-12-30

### Fixed

- Slightly wider width to prevent resizing during error messaging

## [1.2.1] - 2024-12-30

### Fixed

- Set `disableEnforceFocus` to play nicely with other `Dialog` elements

## [1.2.0] - 2024-12-30

### Added

- Added error handling to silent login and silent login listener

## [1.1.1] - 2024-12-30

### Fixed

- Lengthy login timeout now correctly clears when a login is successful 

## [1.1.0] - 2024-12-30

### Added

- Added `hasInvalidTokens` to allow for developers to show a persistent popup informing the user they are unauthenticated

## [1.0.9] - 2023-12-22

### Fixed

- Did not handle react strict mode correctly 

## [1.0.0] - 2023-12-03

### Added

- First major release ready for publishing
