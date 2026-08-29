---
layout: docs
label: guide
title: Contributing to Core Build Packages
---

This page is for contributions to Susee's core build internals in this repository.

## Target modules

The main build stages are implemented in Rust under `src/core/`:

- `src/core/susee_bundler`
- `src/core/susee_compiler`
- `src/core/susee_tree`
- `src/core/susee_config`
- `src/core/susee_hooks`
- `src/core/susee_build`
- `src/core/susee_cli`
- `src/core/susee_utils`
- `src/core/susee_unique_name`
- `src/core/susee_log`
- `src/core/susee_types`

The native addon entry points live in `src/lib.rs` (`suseeBuild`, `cliBuild`, `suseeBundler`).

## 1. Work in this repository

Install Node dependencies for the napi-rs build tooling:

```sh
npm install
```

If the repository has a hooks installation script, run:

```sh
npm run hooks:install
```

Build the native addon:

```sh
npm run build
```

Run Rust checks and tests with cargo:

```sh
cargo check
cargo test
```

## 2. Pick the owning module first

Before coding, choose exactly where the fix belongs:

- API surface or transforms in bundling: `src/core/susee_bundler`
- compiler behavior: `src/core/susee_compiler`
- dependency graph logic: `src/core/susee_tree`
- filesystem/output handling or `package.json` updates: `src/core/susee_utils`
- TypeScript options resolution: `src/core/susee_config/ts_options`
- config parsing/validation: `src/core/susee_config/config_types`
- built-in hooks (minify, unused code, duplicates, ...): `src/core/susee_hooks`
- CLI dispatch: `src/core/susee_cli`
- native addon bindings: `src/lib.rs`

## 3. Implement and test in-module

Recommended flow:

1. Make changes in one module slice first.
2. Run the narrowest local test or validation that covers that slice (`cargo test`).
3. Validate adjacent build stages if your change affects shared contracts.

## 4. Keep public behavior in mind

These internals power the public `susee` CLI and programmatic API, so for behavior changes:

- document the change in package README/changelog if needed
- verify CLI, config, or build integration behavior still matches expectations
- avoid silent breaking changes

## 5. Commit and open PR

```sh
# run this command in terminal
npm run commit
```

```sh
1) ⭐ feat          3) 🎨 modified      5) 👕 refactor      7) 📦 add(package)  9) ✅ tests
2) 🐛 bug           4) 🔒 security      6) ⚠️ deprecated     8) 🚀 release
Select a number for commit type: # select number what your change
Enter commit message: # enter your commit message

# that will commit to your current branch
```

Then open a pull request in:

- <https://github.com/phothinmg/susee>

## Related pages

- [Contribution Overview](/guide/contribution-overview)
- [Core Build Packages](/guide/ecosystem-core-build-packages)
- [Pull Request Checklist](/guide/contribution-pr-checklist)
