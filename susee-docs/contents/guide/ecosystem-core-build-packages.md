---
layout: docs
label: guide
title: Core Build Packages
---

These internal Rust modules make up the main Susee build pipeline inside this repository, exposed to Node.js via napi-rs (`src/lib.rs`).

## `src/core/susee_bundler`

- Purpose: dependency-aware source bundling for Susee builds
- Description: internal bundling stage used by the public `suseeBuild` API and the CLI compiler flow
- Role in flow: merges dependency and entry content, runs the built-in tree hooks, pretty-prints the bundled source via oxc's codegen

## `src/core/susee_compiler`

- Purpose: oxc-based compilation of bundled source
- Description: internal compiler stage that emits `.mjs`/`.cjs`, declaration files (`.d.mts`/`.d.cts`), and source maps
- Role in flow: produces ESM/CommonJS output code and declaration artifacts; runs the `minify` post-process hook when enabled

## `src/core/susee_tree`

- Purpose: dependency graph generation
- Description: graph building, JSON/CTS/CJS module handling, and dependency-file collection for bundling
- Role in flow: analyzes the source dependency tree used by the bundler and fails fast on duplicate top-level declarations

## `src/core/susee_config`

- Purpose: configuration parsing and compiler-option resolution
- Description: reads `susee.config.jsonc` (with JSONC comments), validates entry points, and normalizes TypeScript compiler options from custom paths, root `tsconfig.json`, or defaults
- Role in flow: produces `BuildOptions` consumed by the `Compiler`

## `src/core/susee_hooks`

- Purpose: built-in build hooks
- Description: tree hooks (export-default, anonymous, duplicates, remove), pre-process unused-code cleanup, and the post-process oxc minifier
- Role in flow: runs automatically during bundling and compilation; not user-configurable from config today

## When to work in these directly

Work in these modules directly when:

- You are changing a specific internal build stage.
- You need to debug bundling, dependency analysis, compiler output, or package metadata updates.
- You want to understand which source module owns a behavior before editing.

## High-level flow

These modules are wired together in the current codebase like this:

1. `src/core/susee_tree` discovers the dependency graph.
2. `src/core/susee_bundler` merges sources and runs the tree hooks.
3. `src/core/susee_config/ts_options` resolves compiler options.
4. `src/core/susee_compiler` emits output files and delegates metadata updates to `src/core/susee_utils`.

## Public entry points into this pipeline

Most users should interact with the pipeline through the public `susee` package exports:

- `suseeBuild(config?)`
- `suseeBundler(entry)`
- `cliBuild(args)`

Example:

```js
const { suseeBuild, suseeBundler } = require("susee");

const bundledCode = suseeBundler("src/index.ts");

suseeBuild({
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
- [Build Hooks and Lifecycle](/guide/plugin-types-lifecycle)
- [Extending the Build](/guide/how-to-write-plugins)
