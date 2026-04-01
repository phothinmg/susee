# Contributing to susee

Thanks for contributing to **susee**.

## Prerequisites

- Node.js (current active LTS recommended)
- npm

## Local setup

```bash
git clone https://github.com/phothinmg/susee.git
cd susee
npm install
npm run hooks:install
```

This installs repository-tracked Git hooks from `.githooks`.

## Branching and workflow

1. Create a focused branch from `main`.
2. Keep one logical change per PR (feature, fix, or refactor).
3. Run checks locally before pushing.
4. Open a PR with a clear summary and test evidence.

## Commit message format

Commit subject lines must follow:

```text
<Type>: <message> (#<number>)
```

Example:

```text
Added: support plugin hook ordering (#42)
```

Allowed `Type` values:

- Added
- Changed
- Deprecated
- Fixed
- Security
- Modified

The `.githooks/commit-msg` hook enforces this format.

The helper script `npm run commit` can be used to:

- stage all changes (`git add .`)
- create a formatted commit message with incremented number
- push to the current branch

## Quality checks

Run these before opening a PR:

```bash
npm run lint
npm run test
npm run build
```

Additional useful command:

```bash
npm run fmt
```

The `.githooks/pre-push` hook currently runs:

```bash
npm run lint
npx tsx ./scripts/codecov/index.ts
```

## Tests

`npm run test` uses an interactive runner in `scripts/susee-tests.ts`.

Current test modes:

- run all tests
- initialization tests
- bundle tests
- code coverage generation

## Project docs

Primary internal documentation:

- `project-docs/initialization.md`
- `project-docs/architecture.md`

## Architecture summary

The project follows a three-phase pipeline: **initialization**, **bundling**, and **compilation**.

- Initialization resolves config, validates entry points, collects dependencies, and runs type checks.
- Bundling normalizes/rewrites source units and applies dependency + pre-process logic.
- Compilation emits ESM/CommonJS outputs and optional package metadata updates.

For deeper details, see `project-docs/architecture.md`.
