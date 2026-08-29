---
layout: docs
label: guide
title: Configuration File Structure
---

This page explains how `susee.config.jsonc` is structured and how each option affects the build. The configuration is centered around one root object, `SuSeeConfig`, with one or more package entry definitions.

## Supported config filename

Susee looks for a single configuration file in your project root:

1. `susee.config.jsonc`

The file is parsed as JSONC (JSON with comments), so you may include `// ...` line comments and `/* ... */` block comments. Run `npx susee init` to generate a starter file.

## Root config shape

The configuration is defined by the Rust struct `SuSeeConfig`, exposed to Node.js through napi-rs. Field names use camelCase to match the JSON config form.

```jsonc
{
  // Entry points to bundle
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm", "commonjs"],
      "tsconfigFilePath": null,
      "warning": false
    }
  ],
  // Output directory (default: "dist")
  "outDir": "dist",
  // Update package.json fields from build output (default: false)
  "allowUpdatePackageJson": false,
  // Minify output JS with the oxc minifier (default: false)
  "minify": true
}
```

The underlying TypeScript interface (for inline usage of the programmatic API) is:

```ts
type OutputFormat = ("commonjs" | "esm")[];

interface EntryPoint {
  entry: string;
  exportPath: "." | `./${string}`;
  format?: OutputFormat;
  tsconfigFilePath?: string | null;
  warning?: boolean;
}

interface SuSeeConfig {
  entryPoints: EntryPoint[];
  outDir?: string;
  allowUpdatePackageJson?: boolean;
  minify?: boolean;
}
```

## Example config file

```jsonc
{
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm", "commonjs"],
      "warning": false
    }
  ],
  "outDir": "dist",
  "allowUpdatePackageJson": false
}
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

### `minify`

This controls whether the emitted JavaScript is run through the oxc minifier (compression + mangling) before being written to disk.

- Type: `boolean`
- Default: `false`

Minification is a post-compile pass over the final emitted `.mjs`/`.cjs` output. If the minifier cannot parse the code, Susee falls back to the unminified source so the build never breaks on an edge case.

## Entry point options

Each object in `entryPoints` describes one published package entry.

For a detailed breakdown of every entry field, examples, and validation rules, see [Entry Points](/guide/entry-points).

At a high level, each `EntryPoint` defines:

- Which source file to build
- Which package export path it maps to
- Which module formats to generate
- Whether entry-specific tsconfig or warning handling should apply

Susee does not expose a config flag for automatic duplicate top-level declaration renaming. Conflicting declarations are reported as build errors and should be fixed in source files.

The `warning` field is specific: when dependency analysis finds referenced npm modules that are not installed, setting `warning: true` makes those warnings fatal and exits the build with code `1`.

For a focused guide on root `tsconfig.json`, per-entry `tsconfigFilePath`, and CLI `--tsconfig`, see [tsconfig.json and Custom tsconfig Path Integration](/guide/tsconfig-and-custom-path-integration).

## Multi-entry example

```jsonc
{
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm", "commonjs"]
    },
    {
      "entry": "src/cli.ts",
      "exportPath": "./cli",
      "format": ["esm"]
    }
  ],
  "outDir": "dist"
}
```

This structure is useful when your package exposes a main API and one or more subpath exports.

## Validation rules

Susee validates configuration before building.

- `entryPoints` must contain at least one entry.
- Every `entry` file must exist.
- Every `exportPath` must be unique.
- If no config file is found, the default CLI build command fails.

## Recommended starting point

For most packages, this is a solid minimal setup (this is exactly what `npx susee init` generates):

```jsonc
{
  // Entry points to bundle
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm", "commonjs"],
      "tsconfigFilePath": null,
      "warning": false
    }
  ],
  // Output directory (default: "dist")
  "outDir": "dist",
  // Update package.json fields from build output (default: false)
  "allowUpdatePackageJson": false,
  // Minify output JS with the oxc minifier (default: false)
  "minify": true
}
```
