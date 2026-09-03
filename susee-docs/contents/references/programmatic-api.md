---
layout: docs
label: references
title: Programmatic API
---

This page documents how to use susee programmatically from TypeScript or JavaScript code. This approach is suitable for integrating susee into build scripts, custom tooling, or automation workflows where command-line execution is not preferred.

## Overview

The `susee` package is a pure TypeScript library that re-exports the async `build` function and the `SuSeeConfig` type from its main entry point.

| Export         | JS signature                     | Description                                           |
| -------------- | -------------------------------- | ----------------------------------------------------- |
| `build`        | `(config?: SuSeeConfig) => Promise<void>` | Full config-driven build                     |
| `SuSeeConfig`  | *(type)*                         | Configuration object                                  |

`build` is the main programmatic build API. It orchestrates configuration loading, dependency resolution, bundling, and compilation. The package provides dual-format exports (ESM + CommonJS).

> The `build` function is **async** — always `await` the call.

## Package Exports

The susee package provides dual-format exports:

- **ESM**: `dist/index.mjs` with types at `dist/index.d.mts`
- **CommonJS**: `dist/index.cjs` with types at `dist/index.d.cts`

There is also a `./cli` subpath export for programmatic access to the CLI entry point.

### Import Syntax

#### ESM Example

```ts
import { build, type SuSeeConfig } from "susee";

const options: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
  outDir: "dist",
  allowUpdatePackageJson: true,
};

await build(options);
```

#### CommonJS Example

```js
const { build } = require("susee");

const options = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
  outDir: "dist",
  allowUpdatePackageJson: true,
};

build(options);
```

## `build(config?)`

The primary interface for programmatic execution.

- **Parameters**: `config?: SuSeeConfig`
- **Return type**: `Promise<void>`
- **Async**: Yes

When `config` is omitted, `build` looks for a config file (`susee.config.ts`, `susee.config.js`, or `susee.config.mjs`) in the current working directory. When a `SuSeeConfig` is provided, it overrides the file-based configuration. After the build completes, the elapsed time is logged.

On a build error the function logs an error message and exits the process with code `1`.

## `SuSeeConfig`

```ts
interface SuSeeConfig {
  entryPoints: EntryPoint[];
  outDir?: string;                   // default: "dist"
  allowUpdatePackageJson?: boolean;   // default: false
}

interface EntryPoint {
  entry: string;                      // required, must exist on disk
  exportPath: "." | `./${string}`;    // required, must be unique
  format?: ("commonjs" | "esm")[];    // default: ["esm"]
  tsconfigFilePath?: string | undefined; // default: undefined
  checks?: CheckOptions;              // default: { checkAnonymous: false, checkDefaultExports: false, checkNpmInstalled: false }
  minify?: boolean | { options: MinifyOptions }; // default: false
}

interface CheckOptions {
  checkAnonymous: boolean;
  checkDefaultExports: boolean;
  checkNpmInstalled: boolean;
}
```

## Execution Pipeline

`build` implements a three-stage pipeline.

### 1. Configuration Resolution

If a `config` argument is provided, it is normalized via `generateBuildOptions`. If `config` is omitted, the loader looks for a config file (`susee.config.ts`, `susee.config.js`, `susee.config.mjs`) in the current working directory and imports its default export as a `SuSeeConfig`.

### 2. Validation

Entry points are validated by `checkEntries`:

- At least one entry is required.
- Every `entry` file must exist on disk.
- Every `exportPath` must be unique.

If validation fails, an error message is logged and the process exits with code `1`.

### 3. Compilation Orchestration

A `Compiler` instance is created with the resolved `BuildOptions`. `compiler.compile()` then handles, for each entry point and each requested output format:

1. Bundling the entry's local dependency tree into a single source string (via `@suseejs/susee_bundler`).
2. Resolving TypeScript compiler options from `tsconfigFilePath`, root `tsconfig.json`, or internal defaults (via `@suseejs/ts6`).
3. Detecting JSX in the bundled source and adjusting compiler options if needed.
4. Compiling the bundled source in-memory using `@suseejs/ts6`.
5. Optionally minifying the emitted JS with `oxc-minify` (when `minify` is enabled for the entry).
6. Writing `.mjs`/`.cjs`, `.d.mts`/`.d.cts`, and `.mjs.map`/`.cjs.map` files to the output directory.
7. Optionally updating `package.json` export metadata (when `allowUpdatePackageJson: true`).

## Related pages

- [Command Line Interface](/references/command-line-interface)
- [Configuration File Structure](/guide/config-file-structure)
- [Quick Start](/guide/quick-start)
