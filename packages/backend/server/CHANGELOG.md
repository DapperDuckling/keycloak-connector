# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
