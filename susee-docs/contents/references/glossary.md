---
layout: docs
label: references
title: Glossary
---

This glossary defines the technical terms, internal concepts, and domain-specific jargon used within the `susee` codebase. It serves as a reference for onboarding engineers to understand the relationship between high-level bundling concepts and their specific implementations in the code.

## Core Terminology

### Entry Point

An `EntryPoint` represents a single source file that susee uses as a root to resolve dependencies and generate a bundle. It is defined in the configuration (`susee.config.jsonc`) and mapped to a specific `exportPath` in the resulting package.

- **Data Flow** : Each entry point is validated for existence and uniqueness by `check_entries` (in `src/core/susee_config/config_types.rs`) before being transformed into a `BuildEntryPoint` object for the internal pipeline.

### Build Options

The `BuildOptions` object is the final, normalized configuration used by the `Compiler`. It contains the processed list of entry points and global settings like the output directory and the minify flag.

- **Generation** : Produced by the `generate_build_options` function which defaults `outDir` to `"dist"` if not specified.

### Output Format

The module system used for the emitted files. `susee` supports dual-format output, represented by the `OutputFormat` enum (`Esm` / `Commonjs`, serialized as lowercase strings).

- **Default** : If no format is provided in the config, it defaults to `[Esm]`.
- **Extensions** : ESM emits `.mjs` / `.d.mts` / `.mjs.map`; CommonJS emits `.cjs` / `.d.cts` / `.cjs.map`.

## System Architecture Concepts

### The Build Pipeline

The `susee` execution flow is managed by the `Compiler` struct (`src/core/susee_compiler/index.rs`), which orchestrates bundling and TypeScript compilation.

#### 1. Configuration & Initialization

The system loads `susee.config.jsonc` and converts it into `BuildOptions`.

- **Key Function** : `build(config)` in `src/core/susee_build/mod.rs`.
- **Resolution** : `get_susee_config_path()` checks for `susee.config.jsonc` in the current working directory.

#### 2. Bundling Phase

The system uses the internal bundler in `src/core/susee_bundler/mod.rs` to resolve the dependency tree and merge files into a single source string.

- **Key Function** : `bundler(entry, root)` called within the compiler's format-specific methods.
- **Logic** : It applies dependency resolution, JSON handling, anonymous/export-default normalization, import/export cleanup, unused-code cleanup, and the internal tree hooks. The final bundled source is pretty-printed through oxc's codegen.

#### 3. Compilation Phase

The bundled source is compiled per `OutputFormat` by `susee_compiler` (`src/core/susee_compiler/susee_compiler.rs`), which emits JavaScript (ESM or CJS), type declarations (`.d.mts`/`.d.cts`), and optional source maps. When `minify` is enabled, the oxc minifier runs as a post-compile hook before files are written. When `allowUpdatePackageJson` is enabled, `package.json` export metadata is updated from the build output.

### Internal Hooks

The internal pipeline applies a fixed set of tree hooks (`src/core/susee_hooks/`) that run during bundling, before compilation:

- `export_default` — normalizes named default exports.
- `anonymous` — names anonymous default exports/imports.
- `duplicates` — detects and renames cross-file duplicate top-level declarations.
- `remove` — strips import/export statements and collects removed imports for re-emission.

A `pre-process` unused-code cleanup pass and a `post-process` minify hook also run in the compiler. These are built-in stages, not user-configurable plugins.
