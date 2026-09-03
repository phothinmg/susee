---
layout: docs
label: guide
title: Build Lifecycle
---

This page documents the build lifecycle and the internal stages that run during a susee build. All stages are built-in and run automatically as part of the bundling and compilation pipeline.

## Lifecycle stages

Susee groups its build work into stages that mirror the lifecycle of the compilation pipeline.

### 1) Bundling stage (via `@suseejs/susee_bundler`)

Run inside `src/bundler.ts`, which calls `suseeBundler(entry, root, checks)` from `@suseejs/susee_bundler`. This stage:

- Resolves the dependency tree from the entry file
- Merges dependency and entry content into a single source string
- Runs dependency analysis and lint checks (anonymous exports, default exports, npm-installed verification)
- The bundled source is cached per entry point using a `WeakMap`

### 2) Compiler option resolution

Run inside `src/compiler/tsoptions.ts` using `@suseejs/ts6`. This stage:

- Reads the custom `tsconfigFilePath` if provided, otherwise finds the root `tsconfig.json`
- Parses the config and produces per-format compiler options (`CommonJS` / `ES2020` module kind)
- Falls back to internal defaults if no tsconfig is found

### 3) Compilation stage (via `@suseejs/ts6`)

Run inside `src/compiler/suseeCompiler.ts`. This stage:

- Creates an in-memory `CompilerHost` that serves the bundled source
- Detects JSX in the bundled source and validates React/`jsxImportSource` runtime
- Adjusts compiler options when JSX is detected (`jsx: ReactJSX`, `lib: ["dom", "dom.iterable", "esnext"]`)
- Emits JavaScript (`.mjs`/`.cjs`), declarations (`.d.mts`/`.d.cts`), and source maps (`.mjs.map`/`.cjs.map`)

### 4) Post-compile: minification (optional)

Run inside `src/helpers/minify.ts`. This stage:

- Runs `oxc-minify` over the emitted JavaScript when the entry's `minify` option is enabled
- Falls back to the unminified source on parse failure
- Gated by the per-entry `minify` config field or the `--minify` CLI flag

### 5) File output and package.json update

Run inside `src/helpers/files.ts`. This stage:

- Writes output files (`.mjs`/`.cjs`, `.d.mts`/`.d.cts`, `.mjs.map`/`.cjs.map`) to the output directory
- Updates `package.json` export metadata (`exports`, `main`, `module`, `types`) when `allowUpdatePackageJson` is enabled

## Lifecycle order

For each entry point and each requested output format (`esm` and/or `commonjs`), susee runs this high-level flow:

1. Resolve compiler options (`tsconfigFilePath` → root `tsconfig.json` → internal defaults)
2. Bundle the entry's dependency tree into a single source string (`@suseejs/susee_bundler`)
3. Detect JSX in the bundled source and adjust compiler options if needed
4. Compile the bundled source in-memory (`@suseejs/ts6`) — emit JS + declarations + source map
5. Rename the sourcemap reference (`.js.map` → `.mjs.map` / `.cjs.map`)
6. Optionally minify the emitted JS (`oxc-minify`, when `minify` is enabled for the entry)
7. Write output files to the output directory
8. Update `package.json` export metadata (only when `allowUpdatePackageJson: true`)

## Related pages

- [Configuration File Structure](/guide/config-file-structure)
- [Entry Points](/guide/entry-points)
- [Key Features](/guide/key-features)
- [Quick Start](/guide/quick-start)
