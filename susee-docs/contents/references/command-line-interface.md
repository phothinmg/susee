---
layout: docs
label: references
title: Command Line Interface
---

This document details the Command Line Interface (CLI) for susee, covering installation methods, execution patterns, and the command behavior implemented in `src/cli`.

The CLI includes a utility for initializing project configurations and provides two primary build modes:

- Configuration-based execution for complex projects
- Flag-based execution for single-entry builds

## Installation and Execution

The `susee` command is the primary entry point for the tool. It can be invoked via standard Node.js package runners or global installation.

| Installation Method  | Command Invocation | Availability Scope        |
| -------------------- | ------------------ | ------------------------- |
| Local dev dependency | `npx susee`        | Project-local only        |
| Package script       | `npm run build`    | Project-local via scripts |
| Global install       | `susee`            | System-wide               |

The CLI accepts entry files ending in `.js`, `.ts`, `.mts`, `.mjs`, `.cjs`, and `.cts`.

## Architecture and Data Flow

The CLI is structured to handle three distinct workflows:

- configuration initialization
- standard configuration-based builds
- single-file builds using command-line arguments

### Commands and Options

#### 1. Configuration-Based Build

**Command** : `susee` or `npx susee`

When run without arguments, susee attempts to find a configuration file (`susee.config.ts`, `susee.config.js`, or `susee.config.mjs`) in the current directory. It resolves the build options and executes the bundling and compilation pipeline.

#### 2. Single Entry Build

**Command** : `susee build <entry> [options]` or `npx susee build <entry> [options]`

This command allows for quick builds without a configuration file.

```txt
--entry <path>                Entry file (optional if provided as positional <entry>)
--outdir <path>               Output directory (default: dist)
--format <cjs|commonjs|esm>   Output format (default: esm)
--tsconfig <path>             Custom tsconfig path
--allow-update[=true|false]   Allow package.json updates (default: false)
--warning[=true|false]        Treat dependency graph warnings as fatal (default: false)
--profile[=true|false]        Print bundler and compiler phase timings (default: false)
```

**Example** :

```sh
npx susee build src/index.ts --outdir dist
npx susee build src/index.ts --format commonjs
npx susee build --entry src/index.ts --format esm --tsconfig tsconfig.build.json
npx susee build src/index.ts --profile
```

#### 3. Initialization

**Command** : `susee init` or `npx susee init`

This command provides an interactive prompt to determine if the project is TypeScript-based.
Based on the user input and the `type` field in `package.json`, it generates the appropriate configuration file:

- **TypeScript** : `susee.config.ts`
- **ESM JavaScript package** : `susee.config.js`
- **CommonJS JavaScript package** : `susee.config.mjs`

#### 4. Help, Version, and Profiling

- `susee --help` or `susee build --help` prints the usage text.
- `susee --version` prints the current package version.
- `--profile` can be passed to `susee` or `susee build ...` to enable per-phase timing logs.

## Exit Codes and Diagnostics

The CLI uses standard exit codes to communicate status:

| Exit Code | Meaning | Triggers                                                                      |
| --------- | ------- | ----------------------------------------------------------------------------- |
| 0         | Success | Build completed and artifacts written to disk.                                |
| 1         | Failure | Missing entry point, invalid flags, unknown CLI usage, or failed validation.  |
