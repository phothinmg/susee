# Contribution Overview

This section describes how to contribute to:

- `susee` (this repository)
- Core build scope packages in the `@suseejs/*` ecosystem from the monorepo: <https://github.com/phothinmg/suseejs>

## Choose your contribution path

### Contribute to `susee`

Use this path when your change is in the main CLI/tooling package, docs, or integration behavior.

Read next: [Contributing to Susee](/guide/contribution-susee)

### Contribute to core build packages in `suseejs`

Use this path when your change belongs to package internals such as:

- `@suseejs/bundler`
- `@suseejs/compiler`
- `@suseejs/graph`
- `@suseejs/files`
- `@suseejs/tsoptions`

Read next: [Contributing to Core Build Packages](/guide/contribution-core-build-packages)

## Shared contribution principles

- Keep changes focused and small.
- Add tests for behavior changes.
- Keep docs in sync with API/CLI changes.
- Prefer backward-compatible updates unless a breaking change is planned and documented.
- Use `npm` as the contributor package manager to match `package-lock.json` and npm-based scripts.
- After cloning, install git hooks with `npm run hooks:install` when the repository provides this script.

## Before opening a PR

Use the quality checklist: [Pull Request Checklist](/guide/contribution-pr-checklist)
