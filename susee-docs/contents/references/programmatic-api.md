---
layout: docs
label: references
title: Programmatic API
---

This page documents how to use susee programmatically from TypeScript or JavaScript code. This approach is suitable for integrating susee into build scripts, custom tooling, or automation workflows where command-line execution is not preferred.

## Overview

Susee is a native Node addon built with [napi-rs](https://napi.rs). The Rust `susee` crate exposes three `#[napi]`-annotated functions, each delegating to an internal `core` module. From JavaScript they are available on the package's main entry point:

| Export         | JS signature                              | Rust function                                    | Description                                          |
| -------------- | ----------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `suseeBuild`   | `(config?: SuSeeConfig) => void`          | `susee_build(config: Option<SuSeeConfig>)`       | Full config-driven build                             |
| `cliBuild`     | `(args: string[]) => void`                | `cli_build(args: Vec<String>)`                   | Run the CLI dispatcher with an explicit argument list |
| `suseeBundler` | `(entry: string) => string`               | `susee_bundler(entry: String) -> String`         | Bundle one entry into a merged source string          |
| `SuSeeConfig`  | *(type)*                                  | `SuSeeConfig` struct                             | Configuration object                                  |
| `EntryPoint`   | *(type)*                                  | `EntryPoint` struct                              | One entry in `entryPoints`                           |
| `OutputFormat` | *(type)*                                  | `OutputFormat` enum (`"esm" | "commonjs"`)       | Output module format                                  |

`suseeBuild` is the main programmatic build API. It orchestrates configuration loading, dependency resolution, bundling, and compilation. The native addon can be consumed in both ESM and CommonJS environments.

> The functions are **synchronous** in the native addon. `suseeBuild` returns `void`; `suseeBundler` returns the bundled source string directly. Do not `await` these calls.

## Package Exports

The susee package provides dual-format exports. The main entry point (`index.js` / `index.d.ts`) re-exports the napi-generated functions and TypeScript types.

### Import Syntax

#### ESM Example

```ts
import { suseeBuild, type SuSeeConfig } from "susee";

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
  minify: false,
};

suseeBuild(options);
```

#### CommonJS Example

```js
const { suseeBuild } = require("susee");
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
  minify: false,
};

suseeBuild(options);
```

## `suseeBuild(config?)`

The primary interface for programmatic execution.

- **Name** : `suseeBuild`
- **Parameters** : `config?: SuSeeConfig`
- **Return type** : `void`
- **Async** : No (synchronous native call)

When `config` is omitted, `suseeBuild` loads `susee.config.jsonc` from the current working directory. When a `SuSeeConfig` is provided, it overrides the file-based configuration. After the build completes, the elapsed time is logged via the internal `susee_log` module.

On a build error the function prints `[Error] : <message>` to stderr and exits the process with code `1`.

## Other runtime exports

### `suseeBundler(entry)`

Use this when you want the merged bundled source string without running the compiler or writing files.

- **Parameters** : `entry: string` — resolved relative to the current working directory (`.`)
- **Return type** : `string` — the bundled JavaScript/TypeScript source

On a bundler error the message `"Error when bundling"` is printed and the process panics.

### `cliBuild(args)`

Use this when embedding the CLI entry flow into another Node.js process.

- **Parameters** : `args: string[]` — pass `process.argv.slice(2)` (the user-supplied arguments with the Node executable and script path already stripped)
- **Return type** : `void`

This is the same dispatcher the `susee` bin script uses. See [Command Line Interface](/references/command-line-interface) for the supported subcommands and flags.

## `SuSeeConfig`

The configuration struct, defined in Rust and exposed to JavaScript via napi-rs `#[napi(object)]`. JSON field names use camelCase.

```ts
interface SuSeeConfig {
  entryPoints: EntryPoint[];
  outDir?: string;                  // default: "dist"
  allowUpdatePackageJson?: boolean;  // default: false
  minify?: boolean;                  // default: false
}

interface EntryPoint {
  entry: string;                     // required, must exist on disk
  exportPath: "." | `./${string}`;   // required, must be unique
  format?: ("commonjs" | "esm")[];   // default: ["esm"]
  tsconfigFilePath?: string | null;   // default: null
  warning?: boolean;                  // default: false
}
```

## Execution Pipeline

`suseeBuild` implements a three-stage pipeline.

### 1. Configuration Resolution

If a `config` argument is provided, it is normalized via `generate_build_options`. If `config` is omitted, the loader looks for `susee.config.jsonc` in the current working directory and parses it (stripping JSONC comments) into a `SuSeeConfig`.

### 2. Validation

Entry points are validated by `check_entries`:

- At least one entry is required.
- Every `entry` file must exist on disk.
- Every `exportPath` must be unique.

If validation fails, an error message is returned and the process exits with code `1`.

### 3. Compilation Orchestration

A `Compiler` instance is created with the resolved `BuildOptions`. `compiler.compile()` then handles, for each entry point and each requested `OutputFormat`:

1. Bundling the entry's local dependency tree into a single source string (`bundler`).
2. Running internal tree hooks (export-default normalization, anonymous-export naming, duplicate-declaration detection, import/export removal).
3. Compiling the bundled source with the oxc parser/transformer/codegen.
4. Optionally minifying the emitted JS with the oxc minifier (when `minify: true`).
5. Writing `.mjs`/`.cjs`, `.d.mts`/`.d.cts`, and `.js.map`/`.cjs.map` files to the output directory.
6. Optionally updating `package.json` export metadata (when `allowUpdatePackageJson: true`).

## Related pages

- [Command Line Interface](/references/command-line-interface)
- [Configuration File Structure](/guide/config-file-structure)
- [Quick Start](/guide/quick-start)
