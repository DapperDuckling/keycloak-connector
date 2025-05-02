# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.10] - 2025-05-02

### Fixed

- Replaced no-op import

## [3.0.9] - 2025-05-01

### Fixed

- Enhanced redis connection initialization retry and error logging

## [3.0.8] - 2025-05-01

### Added

- Retries for redis connection initiation

## [3.0.0] - 2025-04-18

(No change. Version number sync)

## [1.1.8] - 2024-10-01

### Fixed

- Added ready message for redis cluster

## [1.1.2] - 2024-08-21

### Fixed

- Removed client name from subscriber client as well

## [1.1.1] - 2024-08-21

### Fixed

- Fixed `CLUSTER_REDIS_CLIENT_NAME_DISABLE` boolean logic

## [1.1.0] - 2024-08-21

### Added

- Added `CLUSTER_REDIS_CLIENT_NAME_DISABLE` to disable redis client renaming. Useful on redis providers that strictly forbid the `client` command

## [1.0.36] - 2024-07-27

### Bugfix

- Clarified warning message

## [1.0.0] - 2023-12-03

### Added

- First major release ready for publishing
