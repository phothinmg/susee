---
layout: docs
label: references
title: Glossary
---

This glossary defines the technical terms, internal concepts, and domain-specific jargon used within the `susee` codebase. It serves as a reference for onboarding engineers to understand the relationship between high-level bundling concepts and their specific implementations in the code.

## Core Terminology

### Entry Point

An EntryPoint represents a single source file that susee uses as a root to resolve dependencies and generate a bundle. It is defined in the configuration and mapped to a specific exportPath in the resulting package.

- **Data Flow** : Each entry point is validated for existence and uniqueness by `checkEntries` before being transformed into a `BuildEntryPoint` object for the internal pipeline.

### Build Options

The `BuildOptions` object is the final, validated configuration used by the `Compiler`. It contains the processed list of entry points and global settings like the output directory.

- **Generation** : Produced by the `generateBuildOptions` function which defaults the `outDir` to `"dist"` if not specified.

### Output Format

The module system used for the emitted files. `susee` supports dual-format output.

- **Default** : If no format is provided in the config, it defaults to `["esm"]`.

## System Architecture Concepts

### The Build Pipeline

The `susee` execution flow is managed by the `Compiler` class, which orchestrates bundling and TypeScript compilation.

#### 1. Configuration & Initialization

The system loads the `susee.config.ts` (or `.js/.mjs`) and converts it into `BuildOptions`.

- **Key Function** : `finalSuseeConfig()` called in `build()`.
- **Resolution** : `getConfigPath` checks for supported extensions in the current working directory.

#### 2. Bundling Phase

The system uses the `@suseejs/bundler` package to resolve the dependency tree and merge files into a single source string.

- **Key Function** : `bundler()` called within the compiler's format-specific methods
- **Logic** : It handles identifier renaming (if `renameDuplicates` is true) and applies AST-level transformations.
