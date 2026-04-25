# Entry Points

`entryPoints` is the most important part of a Susee config. Each object in this array describes one published package entry, including where the source comes from, how it should be exported, and which build options apply to that specific entry.

## EntryPoint shape

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
```

## Example entry

```ts
{
  entry: "src/index.ts",
  exportPath: ".",
  format: ["esm", "commonjs"],
  renameDuplicates: true,
  tsconfigFilePath: "tsconfig.json",
  warning: false,
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

- Type: `(\"commonjs\" | \"esm\")[]`
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

### `renameDuplicates`

This controls duplicate declaration handling during bundling.

- Type: `boolean`
- Default: `true`

When enabled, Susee automatically renames duplicate declarations produced during source consolidation. When disabled, duplicate declarations can cause the build to fail.

### `plugins`

This defines the plugins used for the entry.

- Type: `SuseePlugin[] | SuseePluginFunction[]`
- Default: `[]`

Plugins are configured per entry, which means different subpath exports can use different plugin pipelines.

### `warning`

This controls how Susee treats dependency graph warnings.

- Type: `boolean`
- Default: `false`

During dependency analysis, Susee checks whether referenced npm modules are installed. If `warning` is `true`, those warnings are treated as fatal and Susee exits with code `1`.

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
