---
layout: docs
label: guide
title: Ecosystem Overview
---

The Susee ecosystem centers on the public `susee` package — a TypeScript library bundler — and its dependency packages.

## Package map

### Core build pipeline in this repository (TypeScript)

The build engine is implemented in TypeScript under `src/`:

- `src/build.ts` — the `build()` driver that loads config and runs the compiler
- `src/bundler.ts` — bundling wrapper (delegates to `@suseejs/susee_bundler`)
- `src/compiler/index.ts` — the `Compiler` class that drives per-format compilation
- `src/compiler/suseeCompiler.ts` — in-memory TypeScript compilation host using `@suseejs/ts6`
- `src/compiler/tsoptions.ts` — tsconfig resolution and compiler option generation
- `src/config/index.ts` — config loading, validation, and build option generation
- `src/cli/index.ts` — the CLI dispatcher
- `src/cli/parse_args.ts` — CLI argument parsing
- `src/cli/init.ts` — config file scaffolding
- `src/cli/print_help.ts` — help text
- `src/helpers/files.ts` — file system operations and package.json updates
- `src/helpers/minify.ts` — oxc-minify wrapper

The package's main entry point (`src/index.ts`) re-exports `build` and `SuSeeConfig`.

### Runtime dependencies

- `@suseejs/susee_bundler` — dependency-aware source bundling (the core bundler engine)
- `@suseejs/ts6` — TypeScript compiler used for in-memory compilation
- `oxc-minify` — JavaScript minifier (compression + mangling)

### Foundation packages

- `@suseejs/type` — shared type definitions
- `@suseejs/utilities` — common utility helpers
- `@suseejs/color` — terminal color helpers

> **Note**: These foundation packages are used internally by the `@suseejs/*` ecosystem packages but are not direct dependencies of the `susee` package itself.

## How these pieces work together

A typical Susee build flow:

1. `src/config/index.ts` loads the config file and generates `BuildOptions`.
2. `src/bundler.ts` calls `@suseejs/susee_bundler` to bundle the entry's dependency tree into a single source string.
3. `src/compiler/tsoptions.ts` resolves compiler options from tsconfig/defaults.
4. `src/compiler/suseeCompiler.ts` compiles the bundled source using `@suseejs/ts6` into ESM/CJS output with declarations and source maps.
5. `src/helpers/minify.ts` runs `oxc-minify` when the entry's `minify` option is enabled.
6. `src/helpers/files.ts` writes output artifacts and optionally updates `package.json`.

## Which page to read next

- For pipeline internals: [Core Build Packages](/guide/ecosystem-core-build-packages)
- For shared primitives and types: [Foundation Packages](/guide/ecosystem-foundation-packages)
- For contribution workflows: [Contribution Overview](/guide/contribution-overview)

## Install examples

Install the top-level tool:

```sh
npm i -D susee
```

Install foundation packages:

```sh
npm i @suseejs/type @suseejs/utilities @suseejs/color
```
