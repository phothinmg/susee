---
layout: docs
label: guide
title: Extending the Build
---

This guide explains how to influence the susee build pipeline today.

> **Note**: The current Rust/native (napi-rs) implementation of susee does **not** expose a user-configurable plugin API. There is no `plugins` field on `EntryPoint`. The pipeline stages described in [Build Hooks and Lifecycle](/guide/plugin-types-lifecycle) are built-in and cannot be registered from configuration. This page covers the configuration-driven options that are available now.

## 1. Use the `minify` option

The closest current equivalent to a "post-process" transform is the built-in minifier, toggled via the `minify` config field or the `--minify` CLI flag.

```jsonc
{
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm", "commonjs"]
    }
  ],
  "outDir": "dist",
  "minify": true
}
```

When enabled, susee runs the oxc minifier (compression + mangling) over the final emitted `.mjs`/`.cjs` output before writing it to disk. If the minifier cannot parse the code, susee falls back to the unminified source so the build never breaks.

## 2. Use the `warning` option

The `warning` field on each entry point makes dependency-graph warnings fatal:

```jsonc
{
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm"],
      "warning": true
    }
  ]
}
```

When `warning: true`, susee exits with code `1` if it finds referenced npm modules that are not installed during dependency analysis.

## 3. Use per-entry `tsconfigFilePath`

When one entry needs compiler settings that differ from the rest of the package, assign a custom tsconfig to that entry:

```jsonc
{
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm", "commonjs"],
      "tsconfigFilePath": "tsconfig.build.json"
    },
    {
      "entry": "src/cli.ts",
      "exportPath": "./cli",
      "format": ["esm"],
      "tsconfigFilePath": "configs/tsconfig.cli.json"
    }
  ],
  "outDir": "dist"
}
```

See [tsconfig.json and Custom tsconfig Path Integration](/guide/tsconfig-and-custom-path-integration) for the full resolution priority.

## 4. Run builds from the programmatic API

For custom orchestration, drive susee from a script instead of extending the pipeline:

```js
const { suseeBuild, suseeBundler } = require("susee");

// Full build
suseeBuild({
  entryPoints: [
    { entry: "src/index.ts", exportPath: ".", format: ["esm", "commonjs"] },
  ],
  outDir: "dist",
  minify: true,
});

// Or get just the bundled source string
const bundled = suseeBundler("src/index.ts");
```

See the [Programmatic API](/references/programmatic-api) reference for all exports.

## Related pages

- [Build Hooks and Lifecycle](/guide/plugin-types-lifecycle)
- [Configuration File Structure](/guide/config-file-structure)
- [Entry Points](/guide/entry-points)
- [Quick Start](/guide/quick-start)
