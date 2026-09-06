---
layout: docs
label: references
title: Programmatic API
---

This page documents how to use susee programmatically from TypeScript or JavaScript code. This approach is suitable for integrating susee into build scripts, custom tooling, or automation workflows where command-line execution is not preferred.

## Overview

The `susee` package is a pure TypeScript library that re-exports the `build` and `suseeBundle` functions, the `SuSeeConfig` type, and the `CheckOptions` type from its main entry point (`src/index.ts`). `build` is async; `suseeBundle` is synchronous.

| Export         | JS signature                                  | Description                                                              |
| -------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `build`        | `(options?: SuSeeConfig) => Promise<void>`    | Full config-driven build (loads config file when `options` is omitted)  |
| `suseeBundle`  | `(entry: string, checkOptions?: CheckOptions) => string` | Bundle a single entry's dependency tree into a source string (sync)  |
| `SuSeeConfig`  | *(type)*                                      | Configuration object for `build`                                         |
| `CheckOptions` | *(type)*                                      | Lint check options for `suseeBundle` and `entryPoints[].checks`           |

`build` is the main programmatic build API. It orchestrates configuration loading, dependency resolution, bundling, and compilation. `suseeBundle` is a lower-level synchronous API that returns the bundled source string for a single entry without compiling or writing files. The package provides dual-format exports (ESM + CommonJS).

> The `build` function is **async** — always `await` the call. `suseeBundle` is synchronous.

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

await build(options);
```

The `build` function is async — always `await` the call in an async context.

## `build(options?)`

The primary interface for programmatic execution.

- **Parameters**: `options?: SuSeeConfig`
- **Return type**: `Promise<void>`
- **Async**: Yes

When `options` is provided, it is normalized via `generateBuildOptions` and takes priority over any config file. When `options` is omitted, `build` looks for a config file (`susee.config.ts`, `susee.config.js`, or `susee.config.mjs`) in the current working directory and imports its default export. If neither source is available, `build` logs an error and exits with code `1`. After the build completes, the elapsed time is logged.

On a build error the function logs an error message and exits the process with code `1`.

## `suseeBundle(entry, checkOptions?)`

A lower-level bundling API that resolves and merges an entry's local dependency tree into a single source string — without compiling or writing any files.

- **Parameters**:
  - `entry: string` — path to the entry file (must exist on disk)
  - `checkOptions?: CheckOptions` — lint check options (defaults to all-`false` when omitted)
- **Return type**: `string` (the bundled source code)
- **Async**: No (synchronous)

Example:

```ts
import { suseeBundle } from "susee";

const code = suseeBundle("src/index.ts", {
  checkAnonymous: true,
  checkDefaultExports: true,
  checkNpmInstalled: true,
});

// `code` is the merged source string — compile or write it yourself
```

When the bundled dependency set contains CommonJS modules, `suseeBundle` emits a warning suggesting migration to ESM.

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

interface MinifyOptions {
  // see the `oxc-minify` package for available options
}
```

## Execution Pipeline

`build` implements a three-stage pipeline.

### 1. Configuration Resolution

If an `options` argument is provided, it is normalized via `generateBuildOptions`. If `options` is omitted, the loader looks for a config file (`susee.config.ts`, `susee.config.js`, `susee.config.mjs`) in the current working directory and imports its default export as a `SuSeeConfig`. The `generateFinalBuildOptions` function coordinates this resolution: it prefers an explicit `options` argument, falls back to the config file, and exits with code `1` if neither is available.

### 2. Validation

Entry points are validated by `checkEntries`:

- At least one entry is required.
- Every `entry` file must exist on disk.
- Every `exportPath` must be unique.

If validation fails, an error message is logged and the process exits with code `1`.

### 3. Compilation Orchestration

A `Compiler` instance is created with the resolved `BuildOptions`. `compiler.compile()` then handles, for each entry point and each requested output format:

1. Bundling the entry's local dependency tree into a single source string (via `bundler(point)` in `src/bundler.ts`, which calls `@suseejs/susee_bundler`).
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
