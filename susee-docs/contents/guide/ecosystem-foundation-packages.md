---
layout: docs
label: guide
title: Foundation Packages
---

These packages provide shared types, helpers, and terminal ergonomics used across the `@suseejs/*` ecosystem.

## `@suseejs/type`

- Purpose: shared type definitions for package contracts
- Description: Type definitions for SuseeJs
- Common usage: dependency-file structures, ecosystem-wide API consistency

## `@suseejs/utilities`

- Purpose: common utility helpers reused across packages
- Description: Utilities for suseejs
- Common usage: reusable transformations and utility operations in package internals

## `@suseejs/color`

- Purpose: terminal color helpers for CLI and logging readability
- Description: Susee Terminal Color
- Common usage: clearer warnings, errors, and status output in tooling

> **Note**: These foundation packages are used internally by the `@suseejs/*` ecosystem packages (e.g., `@suseejs/susee_bundler`) but are not direct dependencies of the `susee` package itself.

## Why this layer matters

Keeping types and shared helpers in focused packages helps:

- reduce duplication across build packages
- simplify maintenance and versioning inside the `@suseejs/*` scope

## Quick install and examples

Install foundation packages:

::: code-group

```sh [npm]
npm i @suseejs/type @suseejs/utilities @suseejs/color
```

```sh [pnpm]
pnpm add @suseejs/type @suseejs/utilities @suseejs/color
```

```sh [yarn]
yarn add @suseejs/type @suseejs/utilities @suseejs/color
```

```sh [bun]
bun add @suseejs/type @suseejs/utilities @suseejs/color
```

:::

Use terminal color helpers:

```ts
import tcolor from "@suseejs/color";

console.log(tcolor.green("Build complete"));
```

Use shared utility helpers:

```ts
import { utils } from "@suseejs/utilities";

const merged = utils.gen.mergeImportsStatement([
  'import { a } from "x";',
  'import { b } from "x";',
]);
```

## Related pages

- [Ecosystem Overview](/guide/ecosystem-overview)
- [Core Build Packages](/guide/ecosystem-core-build-packages)
