# Configuration File Structure

This page explains how `susee.config.*` is structured and how each option affects the build. The configuration is centered around one root object, `SuSeeConfig`, with one or more package entry definitions.

## Supported config filenames

Susee looks for one of these files in your project root:

1. `susee.config.ts`
2. `susee.config.js`
3. `susee.config.mjs`

## Root config shape

```ts
type OutputFormat = ("commonjs" | "esm")[];

interface EntryPoint {
  entry: string;
  exportPath: "." | `./${string}`;
  format?: OutputFormat;
  tsconfigFilePath?: string | undefined;
  renameDuplicates?: boolean;
  plugins?: unknown[];
  warning?: boolean;
}

interface SuSeeConfig {
  entryPoints: EntryPoint[];
  outDir?: string;
  allowUpdatePackageJson?: boolean;
}
```

## Example config file

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
      renameDuplicates: true,
      warning: false,
    },
  ],
  outDir: "dist",
  allowUpdatePackageJson: false,
};

export default config;
```

## Root options

### `entryPoints`

This is the core of the configuration. It is an array of package entry definitions, and at least one entry is required.

- Type: `EntryPoint[]`
- Required: yes

### `outDir`

This sets the root output directory for generated files.

- Type: `string`
- Default: `"dist"`

If an entry uses `exportPath: "."`, output is written directly under `outDir`. If an entry uses a subpath such as `./cli`, Susee writes that entry under a matching nested directory.

### `allowUpdatePackageJson`

This controls whether Susee is allowed to update package metadata based on build output.

- Type: `boolean`
- Default: `false`

## Entry point options

Each object in `entryPoints` describes one published package entry.

For a detailed breakdown of every entry field, examples, and validation rules, see [Entry Points](/guide/entry-points).

At a high level, each `EntryPoint` defines:

- Which source file to build
- Which package export path it maps to
- Which module formats to generate
- Whether entry-specific tsconfig, plugins, duplicate renaming, or warning handling should apply

For a focused guide on root `tsconfig.json`, per-entry `tsconfigFilePath`, and CLI `--tsconfig`, see [tsconfig.json and Custom tsconfig Path Integration](/guide/tsconfig-and-custom-path-integration).

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
  ],
  outDir: "dist",
};

export default config;
```

This structure is useful when your package exposes a main API and one or more subpath exports.

## Validation rules

Susee validates configuration before building.

- `entryPoints` must contain at least one entry.
- Every `entry` file must exist.
- Every `exportPath` must be unique.
- If no config file is found, the default CLI build command fails.

## Recommended starting point

For most packages, this is a solid minimal setup:

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
  outDir: "dist",
  allowUpdatePackageJson: false,
};

export default config;
```
