---
layout: docs
label: guide
title: Contribution Overview
---

This section describes how to contribute to:

- `susee` (this repository — a native Node addon built with Rust + napi-rs)
- The internal Rust build modules that implement bundling, dependency analysis, compilation, file output, hooks, and tsconfig resolution

## Choose your contribution path

### Contribute to `susee`

Use this path when your change is in the main CLI/tooling package, the native addon bindings (`src/lib.rs`), docs, or integration behavior.

Read next: [Contributing to Susee](/guide/contribution-susee)

### Contribute to core build internals

Use this path when your change belongs to the internal build pipeline under `src/core/`, such as:

- `src/core/susee_bundler`
- `src/core/susee_compiler`
- `src/core/susee_tree`
- `src/core/susee_config`
- `src/core/susee_hooks`
- `src/core/susee_utils`

Read next: [Contributing to Core Build Packages](/guide/contribution-core-build-packages)

## Shared contribution principles

- Keep changes focused and small.
- Add Rust tests (`cargo test`) for behavior changes.
- Keep docs in sync with API/CLI changes.
- Prefer backward-compatible updates unless a breaking change is planned and documented.
- Use `npm` as the contributor package manager for the napi-rs build tooling.
- After cloning, install git hooks with `npm run hooks:install` when the repository provides this script.

## Before opening a PR

Use the quality checklist: [Pull Request Checklist](/guide/contribution-pr-checklist)
