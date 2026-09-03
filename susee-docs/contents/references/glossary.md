---
layout: docs
label: references
title: Glossary
---

This glossary defines the technical terms, internal concepts, and domain-specific jargon used within the `susee` codebase. It serves as a reference for onboarding engineers to understand the relationship between high-level bundling concepts and their specific implementations in the code.

## Core Terminology

### Entry Point

An `EntryPoint` represents a single source file that susee uses as a root to resolve dependencies and generate a bundle. It is defined in the configuration (`susee.config.{ts,js,mjs}`) and mapped to a specific `exportPath` in the resulting package.

- **Data Flow**: Each entry point is validated for existence and uniqueness by `checkEntries` (in `src/config/index.ts`) before being transformed into a `BuildEntryPoint` object for the internal pipeline.

### Build Options

The `BuildOptions` object is the final, normalized configuration used by the `Compiler`. It contains the processed list of entry points and global settings like the output directory and the package update flag.

- **Generation**: Produced by the `generateBuildOptions` function which defaults `outDir` to `"dist"` if not specified.

### Output Format

The module system used for the emitted files. `susee` supports dual-format output, represented by the `OutputFormat` type (`"commonjs" | "esm"`).

- **Default**: If no format is provided in the config, it defaults to `["esm"]`.
- **Extensions**: ESM emits `.mjs` / `.d.mts` / `.mjs.map`; CommonJS emits `.cjs` / `.d.cts` / `.cjs.map`.

## System Architecture Concepts

### The Build Pipeline

The `susee` execution flow is managed by the `Compiler` class (`src/compiler/index.ts`), which orchestrates bundling and TypeScript compilation.

#### 1. Configuration & Initialization

The system loads the config file and converts it into `BuildOptions`.

- **Key Function**: `build(config?)` in `src/build.ts`.
- **Resolution**: `getSuseeConfigPath()` checks for `susee.config.ts`, `susee.config.js`, and `susee.config.mjs` in the current working directory.

#### 2. Bundling Phase

The system uses `@suseejs/susee_bundler` to resolve the dependency tree and merge files into a single source string.

- **Key Function**: `bundler(point)` in `src/bundler.ts`, which calls `suseeBundler(entry, root, checks)` from `@suseejs/susee_bundler`.
- **Logic**: It applies dependency resolution, bundling, and lint checks. The bundled source is cached per entry point using a `WeakMap`.

#### 3. Compilation Phase

The bundled source is compiled per output format by `suseeCompiler` (`src/compiler/suseeCompiler.ts`), using `@suseejs/ts6` as the TypeScript compiler. It emits JavaScript (ESM or CJS), type declarations (`.d.mts`/`.d.cts`), and source maps. When `minify` is enabled for an entry, `oxc-minify` runs as a post-compile step before files are written. When `allowUpdatePackageJson` is enabled, `package.json` export metadata is updated from the build output.

### Compiler Options Resolution

TypeScript compiler options are resolved in `src/compiler/tsoptions.ts` using this priority:

1. A custom `tsconfigFilePath` on the entry point
2. The root `tsconfig.json` (found via `ts6.findConfigFile`)
3. Susee's internal defaults (`CommonJS` / `ES2020` module kind, `Latest` target)

### JSX Handling

The compiler detects JSX syntax in the bundled source using `@suseejs/ts6`'s AST visitor (`isJsxElement`, `isJsxSelfClosingElement`, `isJsxFragment`). When JSX is found, it validates that the source imports either a React runtime or the configured `jsxImportSource` package. If neither is present, the build fails with an error. Compiler options are then adjusted to set `jsx: ReactJSX` and `lib: ["dom", "dom.iterable", "esnext"]`.

### Checks

The `checks` field on each `EntryPoint` provides optional lint validation:

- `checkAnonymous` — detects anonymous default exports/imports
- `checkDefaultExports` — lints default export patterns
- `checkNpmInstalled` — verifies referenced npm modules are installed; when `true`, missing modules cause the build to fail
