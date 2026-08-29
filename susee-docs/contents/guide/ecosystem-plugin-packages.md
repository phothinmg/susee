---
layout: docs
label: guide
title: Plugin Packages
---

These `@suseejs/*` packages are ready-made plugins designed for the Susee plugin API.

> **Note**: The current native (Rust/napi-rs) build of susee does not expose a `plugins` field on `EntryPoint`, so these plugin packages are not wired into the config today. Built-in minification is provided by the `minify` option (oxc minifier). These packages remain available for when the user-configurable plugin API is reintroduced.

## `@suseejs/banner-text-plugin`

- Purpose: prepend/append banner text to generated output
- Description: Susee plugin for banner text
- Good for: license headers, build metadata, project identifiers

## `@suseejs/terser-plugin`

- Purpose: minify generated JavaScript output
- Description: A Susee plugin that minifies JavaScript code using the Terser library.
- Good for: distribution-size reduction and optimized publish artifacts

## Selection guide

Choose plugin packages by outcome:

- Need readable metadata or headers in output: `@suseejs/banner-text-plugin`
- Need compressed output for publish artifacts: `@suseejs/terser-plugin`
- Need custom organization-specific transforms: write your own plugin (see link below)

## Quick install and examples

Install plugin packages:

::: code-group

```sh [npm]
npm i @suseejs/banner-text-plugin @suseejs/terser-plugin
```

```sh [pnpm]
pnpm add @suseejs/banner-text-plugin @suseejs/terser-plugin
```

```sh [yarn]
yarn add @suseejs/banner-text-plugin @suseejs/terser-plugin
```

```sh [bun]
bun add @suseejs/banner-text-plugin @suseejs/terser-plugin
```

:::

Intended usage once the plugin API is available (config shown in TS form for illustration):

```ts
import type { SuSeeConfig } from "susee";
import { suseeBannerText } from "@suseejs/banner-text-plugin";
import { suseeTerser } from "@suseejs/terser-plugin";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
      plugins: [suseeBannerText("/* My Package */"), suseeTerser()],
    },
  ],
};
```

Today, the native build ships equivalent built-in behavior for minification via the `minify` config option.

## Related pages

- [Extending the Build](/guide/how-to-write-plugins)
- [Build Hooks and Lifecycle](/guide/plugin-types-lifecycle)
- [Ecosystem Overview](/guide/ecosystem-overview)
