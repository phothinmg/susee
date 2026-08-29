---
layout: docs
label: guide
title: Ecosystem Overview
---

The current Susee ecosystem mixes the public `susee` package (a native Node addon built with Rust + napi-rs) with internal build modules.

## Package map

### Core build pipeline in this repository (Rust)

The build engine is implemented in Rust under `src/core/`:

- `src/core/susee_bundler` — dependency-aware source bundling
- `src/core/susee_compiler` — oxc-based compilation (ESM/CJS + declarations + source maps)
- `src/core/susee_tree` — dependency graph generation and dependency-file collection
- `src/core/susee_config` — config parsing (`susee.config.jsonc`), entry validation, compiler-option resolution
- `src/core/susee_hooks` — built-in tree/pre-process/post-process hooks (including the oxc minifier)
- `src/core/susee_build` — the `build()` driver that loads config and runs the compiler
- `src/core/susee_cli` — the CLI dispatcher and single-entry compiler
- `src/core/susee_utils` — file system and AST helpers
- `src/core/susee_unique_name` — generated identifier naming for renamed declarations
- `src/core/susee_log` — build timing and error logging
- `src/core/susee_types` — shared types (`DependenciesTree`, `ProjectType`, `OutputFormat`, ...)

The native addon entry points live in `src/lib.rs` and expose `suseeBuild`, `cliBuild`, and `suseeBundler` to Node.js via napi-rs.

### Plugin packages

- `@suseejs/banner-text-plugin`
- `@suseejs/terser-plugin`

> **Note**: The current native (Rust/napi-rs) build does not expose a `plugins` field on `EntryPoint`, so these plugin packages are not wired into the config today. Minification is built in via the `minify` option (oxc minifier). Banner/transform plugins require the user-configurable plugin API to be re-introduced.

### Foundation packages

- `@suseejs/type`
- `@suseejs/utilities`
- `@suseejs/color`

## How these pieces work together

A typical Susee build flow:

1. `src/core/susee_tree` builds the dependency graph (`dependensa::generate_graph`).
2. `src/core/susee_bundler` merges and normalizes dependency and entry code, running the built-in tree hooks.
3. `src/core/susee_compiler` compiles the bundled source into ESM/CJS output with declarations and source maps.
4. `src/core/susee_utils` writes output artifacts and handles file operations.
5. `src/core/susee_config/ts_options` resolves compiler options from tsconfig/defaults.
6. The `minify` post-process hook runs the oxc minifier when enabled.

## Which page to read next

- For pipeline internals: [Core Build Packages](/guide/ecosystem-core-build-packages)
- For installable plugins: [Plugin Packages](/guide/ecosystem-plugin-packages)
- For shared primitives and types: [Foundation Packages](/guide/ecosystem-foundation-packages)
- For contribution workflows across public APIs and internal build modules: [Contribution Overview](/guide/contribution-overview)

## Install examples

Install the top-level tool:

```sh
npm i -D susee
```

Install plugin packages:

```sh
npm i @suseejs/banner-text-plugin @suseejs/terser-plugin
```

Install foundation packages:

```sh
npm i @suseejs/type @suseejs/utilities @suseejs/color
```
