---
layout: docs
label: guide
title: Core Build Packages
---

These internal TypeScript modules make up the main Susee build pipeline inside this repository.

## `src/bundler.ts`

- Purpose: bundling wrapper
- Description: delegates to `@suseejs/susee_bundler`'s `suseeBundler` function, caching results per entry point
- Role in flow: bundles the entry's local dependency tree into a single merged source string

## `src/compiler/index.ts`

- Purpose: compilation orchestration
- Description: the `Compiler` class drives per-format (ESM/CommonJS) compilation of bundled source
- Role in flow: for each entry and format, gets compiler options, detects JSX, compiles via `suseeCompiler`, optionally minifies, writes output files, and optionally updates `package.json`

## `src/compiler/suseeCompiler.ts`

- Purpose: in-memory TypeScript compilation
- Description: creates an in-memory `CompilerHost` using `@suseejs/ts6`, emits JavaScript, declarations, and source maps
- Role in flow: compiles bundled source into `.mjs`/`.cjs` output with `.d.mts`/`.d.cts` declarations

## `src/compiler/tsoptions.ts`

- Purpose: compiler option resolution
- Description: resolves TypeScript compiler options from custom `tsconfigFilePath`, root `tsconfig.json`, or internal defaults
- Role in flow: produces per-format (`commonjs` / `esm`) compiler options consumed by the `Compiler`

## `src/config/index.ts`

- Purpose: configuration parsing and validation
- Description: loads `susee.config.{ts,js,mjs}`, validates entry points, and normalizes into `BuildOptions`
- Role in flow: produces `BuildOptions` consumed by the `Compiler`

## `src/cli/index.ts`

- Purpose: CLI dispatch
- Description: parses `process.argv` and routes to `build`, `init`, version, or help
- Role in flow: entry point for the `susee` bin script

## `src/helpers/files.ts`

- Purpose: file system operations
- Description: writes output files, clears output directory, and updates `package.json` metadata
- Role in flow: handles all file I/O for build output

## `src/helpers/minify.ts`

- Purpose: minification wrapper
- Description: wraps `oxc-minify` to minify emitted JavaScript
- Role in flow: post-compile pass when the entry's `minify` option is enabled

## When to work in these directly

Work in these modules directly when:

- You are changing a specific internal build stage.
- You need to debug bundling, compilation, compiler option resolution, or package metadata updates.
- You want to understand which source module owns a behavior before editing.

## High-level flow

These modules are wired together in the current codebase like this:

1. `src/config/index.ts` loads config and generates `BuildOptions`.
2. `src/bundler.ts` bundles the dependency tree via `@suseejs/susee_bundler`.
3. `src/compiler/tsoptions.ts` resolves compiler options.
4. `src/compiler/suseeCompiler.ts` compiles the bundled source using `@suseejs/ts6`.
5. `src/helpers/minify.ts` optionally minifies the output.
6. `src/helpers/files.ts` writes artifacts and updates `package.json`.

## Public entry points into this pipeline

Most users should interact with the pipeline through the public `susee` package exports:

- `build(config?)` — async build function

Example:

```ts
import { build } from "susee";

await build({
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
});
```

## Related pages

- [Ecosystem Overview](/guide/ecosystem-overview)
- [Configuration File Structure](/guide/config-file-structure)
- [Quick Start](/guide/quick-start)
