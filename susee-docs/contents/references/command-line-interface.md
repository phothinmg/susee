---
layout: docs
label: references
title: Command Line Interface
---

This document details the Command Line Interface (CLI) for susee, covering installation methods, execution patterns, and the command behavior implemented in `src/cli/` (the CLI entry point, argument parser, init scaffolding, and help text).

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

The CLI accepts entry files ending in `.js`, `.ts`, `.mts`, `.mjs`, `.cjs`, `.cts`, `.tsx`, and `.jsx`.

## Architecture and Data Flow

The CLI is structured to handle three distinct workflows:

- configuration initialization
- standard configuration-based builds
- single-file builds using command-line arguments

### Commands and Options

#### 1. Configuration-Based Build

**Command**: `susee build` or `npx susee build`

When run without extra arguments, susee attempts to find a config file (`susee.config.ts`, `susee.config.js`, or `susee.config.mjs`) in the current working directory. It loads the default export, resolves the build options, and executes the bundling and compilation pipeline.

#### 2. Single Entry Build

**Command**: `susee build <entry> [options]` or `npx susee build <entry> [options]`

This command allows for quick builds without a configuration file.

```
--entry <path>                Entry file (optional if provided as positional <entry>)
--outdir <path>               Output directory (default: dist)
--format <cjs|commonjs|esm|both>  Output format (default: esm)
--tsconfig <path>             Custom tsconfig path
--allow-update[=true|false]   Allow package.json updates (default: false)
--minify[=true|false]         Minify output JS with the oxc minifier (default: false)
--check[=true|false]          Enable bundler lint checks (default: false)
```

Boolean flags accept `--flag=true|false`, `--flag true|false`, or a bare `--flag` (defaults to `true`).

Examples:

```
npx susee build src/index.ts --outdir dist
npx susee build src/index.ts --format commonjs
npx susee build --entry src/index.ts --format esm --tsconfig tsconfig.build.json
npx susee build src/index.ts --minify
npx susee build src/index.ts --check
```

#### 3. Initialization

**Command**: `susee init` or `npx susee init`

This command interactively generates a starter config file in the current directory. It prompts whether the project uses TypeScript:

- **Yes** → writes `susee.config.ts`
- **No** → checks `package.json` `type` field:
  - `"module"` → writes `susee.config.js`
  - otherwise → writes `susee.config.mjs`

If a config file already exists at the target path, it is overwritten.

#### 4. Help and Version

- `susee --help` or `susee -h` prints the usage text.
- `susee --version` or `susee -v` prints the current package version (read from the project's `package.json`).

## Exit Codes and Diagnostics

| Exit Code | Meaning | Triggers                                                                      |
| --------- | ------- | ----------------------------------------------------------------------------- |
| 0         | Success | Build completed and artifacts written to disk.                                |
| 1         | Failure | Missing entry point, invalid flags, unknown CLI usage, or failed validation.  |
