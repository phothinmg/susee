<!-- markdownlint-disable -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- compiler: Added JSX runtime validation test coverage for React import,
  `jsxImportSource` success path, missing `jsxImportSource`, and mismatch
  failure behavior.

### Changed

- compiler: Refactored JSX compiler option branching to remove duplicated return
  logic while preserving behavior.
- compiler: Added JSDoc for JSX compiler option normalization and validation.

## [1.5.3] 2026-04-26

### Added

- cli flag `--version` and `-v` for installation check

<!--
https://keepachangelog.com/en/1.1.0/
Added :  for new features.
Changed : for changes in existing functionality.
Deprecated : for soon-to-be removed features.
Fixed : for any bug fixes.
Security : in case of vulnerabilities.
 -->
