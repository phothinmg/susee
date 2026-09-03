---
layout: docs
label: guide
title: Entry Points
---

`entryPoints` is the most important part of a Susee config. Each object in this array describes one published package entry, including where the source comes from, how it should be exported, and which build options apply to that specific entry.

## EntryPoint shape

The `EntryPoint` interface maps 1:1 to each object in `entryPoints`.

```ts
type OutputFormat = ("commonjs" | "esm")[];

interface CheckOptions {
  checkAnonymous: boolean;
  checkDefaultExports: boolean;
  checkNpmInstalled: boolean;
}

interface EntryPoint {
  entry: string;
  exportPath: "." | `./${string}`;
  format?: OutputFormat;
  tsconfigFilePath?: string | undefined;
  checks?: CheckOptions;
  minify?: boolean | { options: MinifyOptions };
}
```

## Example entry

```ts
{
  entry: "src/index.ts",
  exportPath: ".",
  format: ["esm", "commonjs"],
  tsconfigFilePath: "tsconfig.json",
  checks: {
    checkAnonymous: false,
    checkDefaultExports: false,
    checkNpmInstalled: false,
  },
  minify: false,
}
```

## Entry fields

### `entry`

This is the source file Susee will build.

- Type: `string`
- Required: yes
- Example: `"src/index.ts"`

The file must exist. If it does not, Susee exits with an error before the build starts.

### `exportPath`

This defines the package export path for the entry.

- Type: `"."` or a `./subpath` string
- Required: yes

Examples:

- `"."` for the main package export
- `"./cli"` for a CLI subpath export
- `"./utils"` for a utility subpath export

Each `exportPath` must be unique across the config. Duplicate export paths cause Susee to exit with an error.

### `format`

This controls which module formats are generated for the entry.

- Type: `("commonjs" | "esm")[]`
- Default: `["esm"]`

Examples:

- `["esm"]`
- `["commonjs"]`
- `["esm", "commonjs"]`

If duplicate values are provided, Susee normalizes them internally before building.

### `tsconfigFilePath`

This lets you assign a custom TypeScript configuration file to a specific entry.

- Type: `string | undefined`
- Default: `undefined`

Resolution priority is:

1. The entry's `tsconfigFilePath`
2. The root `tsconfig.json`
3. Susee's internal default compiler options

This is useful when one entry needs compiler settings different from the rest of the package.

For practical setup patterns and CLI integration with `--tsconfig`, see [tsconfig.json and Custom tsconfig Path Integration](/guide/tsconfig-and-custom-path-integration).

### `checks`

This controls which lint checks Susee runs on the bundled output.

- Type: `CheckOptions`
- Default: `{ checkAnonymous: false, checkDefaultExports: false, checkNpmInstalled: false }`

| Check field           | Type      | Default | Description                                                                  |
| --------------------- | --------- | ------- | ---------------------------------------------------------------------------- |
| `checkAnonymous`      | `boolean` | `false` | Detect anonymous default exports/imports in the bundled source              |
| `checkDefaultExports` | `boolean` | `false` | Lint default export patterns in the bundled output                          |
| `checkNpmInstalled`   | `boolean` | `false` | Check whether referenced npm modules are installed; treat missing as fatal |

When `checkNpmInstalled` is `true`, Susee checks whether referenced npm modules are installed during dependency analysis. If any are missing, Susee exits with code `1`.

On the CLI, the `--check` flag enables all three checks simultaneously.

### `minify`

This controls whether the emitted JavaScript for this entry is run through the oxc minifier (compression + mangling) before being written to disk.

- Type: `boolean | { options: MinifyOptions }`
- Default: `false`

Pass `true` for default minification, or an object with custom `MinifyOptions` for fine-grained control.

Minification is a post-compile pass over the final emitted `.mjs`/`.cjs` output. If the minifier cannot parse the code, Susee falls back to the unminified source so the build never breaks on an edge case.

### Duplicate declaration handling

Susee validates top-level declarations across the bundled dependency set.

- Conflicting declarations fail the build.
- The fix is to rename or restructure the conflicting source declarations.
- There is no `EntryPoint` flag for automatic duplicate renaming in the current API.

## Single-entry example

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
};

export default config;
```

This is the standard setup for a package with one public entry.

## Multi-entry example

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
    {
      entry: "src/cli.ts",
      exportPath: "./cli",
      format: ["esm"],
    },
    {
      entry: "src/utils.ts",
      exportPath: "./utils",
      format: ["esm"],
    },
  ],
  outDir: "dist",
};

export default config;
```

This structure is useful when your package exposes a main API and one or more subpath exports.

## Validation rules

Susee validates entries before building.

- `entryPoints` must contain at least one entry.
- Every `entry` file must exist.
- Every `exportPath` must be unique.

## Relationship to the full config

`EntryPoint` objects live inside the root `SuSeeConfig` object. For the full config layout, root options, and complete examples, see [Config File Structure](/guide/config-file-structure).
