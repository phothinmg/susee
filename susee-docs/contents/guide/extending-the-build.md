---
layout: docs
label: guide
title: Extending the Build
---

This guide explains how to influence the susee build pipeline through configuration.

## 1. Use the `minify` option

The built-in minifier is toggled via the `minify` field on each entry point or the `--minify` CLI flag.

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
      minify: true,
    },
  ],
  outDir: "dist",
};

export default config;
```

When enabled, susee runs the oxc minifier (`oxc-minify`) — compression + mangling — over the final emitted `.mjs`/`.cjs` output before writing it to disk. If the minifier cannot parse the code, susee falls back to the unminified source so the build never breaks.

You can also pass custom minify options:

```ts
{
  entry: "src/index.ts",
  exportPath: ".",
  format: ["esm", "commonjs"],
  minify: { options: { /* MinifyOptions */ } },
}
```

## 2. Use the `checks` option

The `checks` field on each entry point provides optional lint checks on the bundled output:

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm"],
      checks: {
        checkAnonymous: true,
        checkDefaultExports: true,
        checkNpmInstalled: true,
      },
    },
  ],
};

export default config;
```

When `checkNpmInstalled` is `true`, susee exits with code `1` if it finds referenced npm modules that are not installed during dependency analysis.

On the CLI, the `--check` flag enables all three checks simultaneously.

## 3. Use per-entry `tsconfigFilePath`

When one entry needs compiler settings that differ from the rest of the package, assign a custom tsconfig to that entry:

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
      tsconfigFilePath: "tsconfig.build.json",
    },
    {
      entry: "src/cli.ts",
      exportPath: "./cli",
      format: ["esm"],
      tsconfigFilePath: "configs/tsconfig.cli.json",
    },
  ],
  outDir: "dist",
};

export default config;
```

See [tsconfig.json and Custom tsconfig Path Integration](/guide/tsconfig-and-custom-path-integration) for the full resolution priority.

## 4. Run builds from the programmatic API

For custom orchestration, drive susee from a script:

```ts
import { build } from "susee";

await build({
  entryPoints: [
    { entry: "src/index.ts", exportPath: ".", format: ["esm", "commonjs"], minify: true },
  ],
  outDir: "dist",
});
```

See the [Programmatic API](/references/programmatic-api) reference for all exports.

## Related pages

- [Build Lifecycle](/guide/build-lifecycle)
- [Configuration File Structure](/guide/config-file-structure)
- [Entry Points](/guide/entry-points)
- [Quick Start](/guide/quick-start)