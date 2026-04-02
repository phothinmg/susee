<!-- markdownlint-disable -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [1.5.1] - 2026-04-01

### Added

- Added final pre-bundling checks for unsupported dependency syntaxes (`CommonJS`, `JSX/TSX`). When detected, `susee` logs an actionable error and exits with code `1`.
- Added CLI command `init` to generate a minimal `susee` config file at the project root.
- Added `npm run commit` workflow support in `scripts/susee-commit.ts` to run `git add .`, create a formatted commit message, and push to the active branch.
- Added global commit number incrementation for commit subjects by scanning git history (`git log --all`) and appending `(#<number>)`.

### Changed

- Updated output format options from `"esm" | "commonjs" | "both"` to `("commonjs" | "esm")[]`.
- Improved unsupported-module diagnostics to suggest `@suseejs/plugin-commonjs` for most `CommonJS` projects.
- Migrated Git hooks from `husky`/`commitlint` to repository-tracked hooks in `.githooks`.
- Added `npm run hooks:install` setup flow and enforced commit subject format: `<Type>: <message> (#<number>)` where `Type` is one of `Added`, `Changed`, `Deprecated`, `Fixed`, `Security`, `Modified`.
- Updated `README.md` and `CONTRIBUTING.md` to match the current scripts, hook behavior, and project documentation layout.

### Fixed

- Fixed source map URL generation by adding `resolveSourceMappingURL`, replacing incorrect `//# sourceMappingURL=<fileName>.js.map` with extension-aware values (`.cjs.map` / `.mjs.map`).

### Notes

- `JSX/TSX` dependency transpilation is still unsupported in core and planned for future plugin-based support.
- Browser ESM bundling and mixed-syntax project workflows are still on the roadmap.

## [1.0.0] - 2026-03-05

### Added

- Node-based test suite for `susee.build`.
- Plugin pipeline support across dependency, pre-process, and post-process stages.
- Per-entry config options for `format`, `tsconfigFilePath`, and duplicate symbol handling.

### Changed

- Expanded README documentation covering API, configuration, limitations, and usage.
- Stabilized dual-format output behavior for ESM (`.mjs`, `.d.mts`) and CommonJS (`.cjs`, `.d.cts`).
- Improved `package.json` update flow for `main`, `module`, `types`, and `exports` generation.

### Notes

- `susee` remains focused on local TypeScript dependency bundling and does not bundle `node_modules`.

<!--
https://keepachangelog.com/en/1.1.0/
Added :  for new features.
Changed : for changes in existing functionality.
Deprecated : for soon-to-be removed features.
Fixed : for any bug fixes.
Security : in case of vulnerabilities.
 -->
