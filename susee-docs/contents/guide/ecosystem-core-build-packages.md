---
layout: docs
label: guide
title: Core Build Packages
---

These internal modules make up the main Susee build pipeline inside this repository.

## `src/bundler`

- Purpose: dependency-aware source bundling for Susee builds
- Description: internal bundling stage used by the public `build()` API and CLI compiler flow
- Role in flow: merges dependency and entry content, runs dependency and pre-process plugin stages

## `src/compiler`

- Purpose: TypeScript-based compilation of bundled source
- Description: internal compiler stage that emits `.mjs`, `.cjs`, declaration files, and sourcemaps
- Role in flow: produces ESM/CommonJS output code and declaration artifacts

## `src/dependencies`

- Purpose: dependency graph generation
- Description: graph building, duplicate detection, and dependency-file collection for bundling
- Role in flow: analyzes source dependency tree used by bundler and fails fast on duplicate top-level declarations

## `src/helpers/files.ts`

- Purpose: file system utilities for build output lifecycle
- Description: path resolution, output cleanup, file writes, JSON reads, and `package.json` export updates
- Role in flow: output directory handling, file writes, package metadata updates

## `src/compiler/tsoptions.ts`

- Purpose: compiler option resolution
- Description: loads and normalizes TypeScript compiler options from custom paths, root `tsconfig.json`, or defaults
- Role in flow: loads and normalizes TypeScript compiler options from configured tsconfig/defaults

## When to work in these directly

Work in these modules directly when:

- You are changing a specific internal build stage.
- You need to debug bundling, dependency analysis, compiler output, or package metadata updates.
- You want to understand which source module owns a behavior before editing.

## High-level flow

These modules are wired together in the current codebase like this:

1. `src/dependencies/graph.ts` discovers the dependency graph.
2. `src/dependencies/index.ts` loads dependency files and validates duplicate declarations.
3. `src/bundler/index.ts` merges sources and runs bundler-stage plugin hooks.
4. `src/compiler/tsoptions.ts` resolves compiler options.
5. `src/compiler/index.ts` emits output files and delegates metadata updates to `src/helpers/files.ts`.

## Public entry points into this pipeline

Most users should interact with the pipeline through the public `susee` package exports:

- `build(options?)`
- `suseeBundler(entry)`
- `suseeCliBuild()`

Example:

```ts
import { build, suseeBundler } from "susee";

const bundledCode = await suseeBundler("src/index.ts");

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
- [Plugin Types and Lifecycle](/guide/plugin-types-lifecycle)
- [How to Write Plugins](/guide/how-to-write-plugins)
