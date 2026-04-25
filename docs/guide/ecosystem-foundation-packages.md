# Foundation Packages

These packages provide shared types, helpers, and terminal ergonomics used across Susee packages.

## `@suseejs/type`

- Purpose: shared type definitions for plugin APIs and package contracts
- Description: Type Def for SuseeJs
- Common usage: plugin type unions, dependency-file structures, ecosystem-wide API consistency

## `@suseejs/utilities`

- Purpose: common utility helpers reused across packages
- Description: Utilities for suseejs
- Common usage: reusable transformations and utility operations in package internals

## `@suseejs/color`

- Purpose: terminal color helpers for CLI and logging readability
- Description: Susee Terminal Color
- Common usage: clearer warnings, errors, and status output in tooling

## Why this layer matters

Keeping types and shared helpers in focused packages helps:

- reduce duplication across build packages
- keep plugin contracts consistent
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

Use shared plugin types:

```ts
import type { SuseePlugin } from "@suseejs/type";

const plugin: SuseePlugin = {
  type: "pre-process",
  async: false,
  func(code) {
    return code;
  },
};
```

## Related pages

- [Ecosystem Overview](/guide/ecosystem-overview)
- [Core Build Packages](/guide/ecosystem-core-build-packages)
- [Plugin Packages](/guide/ecosystem-plugin-packages)
