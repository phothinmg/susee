---
layout: docs
label: guide
title: Contribution Overview
---

This section describes how to contribute to:

- `susee` (this repository)
- The internal build modules that implement bundling, dependency analysis, compilation, file output, and tsconfig resolution

## Choose your contribution path

### Contribute to `susee`

Use this path when your change is in the main CLI/tooling package, docs, or integration behavior.

Read next: [Contributing to Susee](/guide/contribution-susee)

### Contribute to core build internals

Use this path when your change belongs to the internal build pipeline, such as:

- `src/bundler`
- `src/compiler`
- `src/dependencies`
- `src/helpers/files.ts`
- `src/compiler/tsoptions.ts`

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
