---
layout: docs
label: references
title: Programmatic API
---

This page documents how to use susee programmatically from TypeScript or JavaScript code. This approach is suitable for integrating susee into build scripts, custom tooling, or automation workflows where command-line execution is not preferred.

## Overview

The package entry point exports three runtime helpers:

- `build(options?)` for full config-driven builds
- `suseeBundler(entry)` for bundling a single entry into a merged source string
- `suseeCliBuild()` for running the CLI entry logic from code

`build(options?)` remains the main programmatic build API. It orchestrates configuration loading, dependency resolution, bundling, and compilation. The API is exported from the main package entry point and can be imported in both ESM and CommonJS environments.

## Package Exports

The susee package provides dual-format exports, allowing consumption in both ESM and CommonJS environments. The main entry point `src/index.ts` exports the core function and configuration types.

| Export        | Type     | Description                                                |
| ------------- | -------- | ---------------------------------------------------------- |
| build         | Function | Full build entry point using inline options or root config |
| suseeBundler  | Function | Bundles one entry and returns merged source code           |
| suseeCliBuild | Function | Runs the CLI dispatcher programmatically                   |
| SuSeeConfig   | Type     | TypeScript interface for the configuration object          |

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

#### CommonJs Example

```js
const { build } = require("susee");
/** @type {import("susee").SuSeeConfig} */
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

## Function Signature

The `build` function is the primary interface for programmatic execution.

- **Name** : `build`
- **Parameters** : options (Optional `SuSeeConfig` object)
- **Return Type** : `Promise<void>`
- **Async** : Yes (must be awaited).

If `options` is omitted, `build()` tries to load `susee.config.ts`, `susee.config.js`, or `susee.config.mjs` from the current working directory.

## Other runtime exports

### `suseeBundler(entry)`

Use this when you want the merged bundled source string without running the compiler or writing files.

- **Parameters** : `entry: string`
- **Return Type** : `Promise<string>`

### `suseeCliBuild()`

Use this when embedding the CLI entry flow into another Node.js process.

- **Parameters** : none
- **Return Type** : `Promise<void>`

## Execution Pipeline

The `build()` function implements a three-stage pipeline.

### 1. Configuration Resolution

The function first determines the configuration to use. If options are passed directly to `build()`, it calls `generateBuildOptions(options)`. If `options` are omitted, it attempts to load a configuration file from the project root.

### 2. Validation

If neither provided options nor a discovered configuration file are found, the process logs an error and exits with code `1`.

### 3. Compilation Orchestration

A `Compiler` instance is instantiated with the resolved `buildOptions`. The `compiler.compile()` method is then invoked, which internally handles dependency resolution, AST bundling, TypeScript emission, output cleanup, and optional `package.json` updates.
