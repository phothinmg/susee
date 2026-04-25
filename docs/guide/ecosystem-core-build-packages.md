# Core Build Packages

These packages make up the main Susee build pipeline.

## `@suseejs/bundler`

- Purpose: dependency-aware source bundling for Susee builds
- Description: Susee Bundler
- Role in flow: merges dependency and entry content, runs dependency and pre-process plugin stages

## `@suseejs/compiler`

- Purpose: TypeScript-based compilation of bundled source
- Description: TypeScript compiler
- Role in flow: produces ESM/CommonJS output code and declaration artifacts

## `@suseejs/graph`

- Purpose: dependency graph generation
- Description: Generate dependencies graph.
- Role in flow: analyzes source dependency tree used by bundler

## `@suseejs/files`

- Purpose: file system utilities for build output lifecycle
- Description: NodeJs File System for SuseeJs
- Role in flow: output directory handling, file writes, package metadata updates

## `@suseejs/tsoptions`

- Purpose: compiler option resolution
- Description: Get typescript compiler options
- Role in flow: loads and normalizes TypeScript compiler options from configured tsconfig/defaults

## When to use these directly

Use these packages directly when:

- You are building custom tooling around Susee internals.
- You need programmatic control over a specific build stage.
- You want a narrow package dependency instead of the full top-level tool.

## Quick install and examples

Install core packages:

::: code-group

```sh [npm]
npm i @suseejs/bundler @suseejs/compiler @suseejs/graph @suseejs/files @suseejs/tsoptions
```

```sh [pnpm]
pnpm add @suseejs/bundler @suseejs/compiler @suseejs/graph @suseejs/files @suseejs/tsoptions
```

```sh [yarn]
yarn add @suseejs/bundler @suseejs/compiler @suseejs/graph @suseejs/files @suseejs/tsoptions
```

```sh [bun]
bun add @suseejs/bundler @suseejs/compiler @suseejs/graph @suseejs/files @suseejs/tsoptions
```

:::

Bundle an entry file:

```ts
import { bundler } from "@suseejs/bundler";

const code = await bundler("src/index.ts");
```

Compile bundled code:

```ts
import { suseeCompiler } from "@suseejs/compiler";
import { getCompilerOptions } from "@suseejs/tsoptions";

const opts = getCompilerOptions();
const compiled = suseeCompiler({
 sourceCode: "export const x = 1;",
 fileName: "src/index.ts",
 compilerOptions: opts.esm("dist"),
});
```

Generate a dependency graph:

```ts
import { generateGraph } from "@suseejs/graph";

const graph = generateGraph("src/index.ts");
const sorted = graph.sort();
```

## Related pages

- [Ecosystem Overview](/guide/ecosystem-overview)
- [Plugin Types and Lifecycle](/guide/plugin-types-lifecycle)
- [How to Write Plugins](/guide/how-to-write-plugins)
