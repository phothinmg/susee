<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee.webp" width="160" height="160" alt="susee" />
  <h1>Susee</h1>
</div>
<!-- markdownlint-enable MD033 -->

[![NPM][nodei_img]][nodei_url]

[![npm version][npm_v_img]][npm_v_url] [![license][license_img]](LICENSE) [![Socket Badge][sb_img]][sb_url] [![codecov][codecov_img]][codecov_url]

TypeScript-first bundler for library packages.

Susee can be used in two ways:

1. Programmatic API from `susee` (`build(options?)`)
2. CLI (`susee`, `susee init`, `susee build ...`)

The sections below are based on the code in `src`.

## Install

```bash
npm i -D susee
```

## Quick Start (CLI)

1. Generate config:

```bash
npx susee init
```

<!-- markdownlint-disable MD029 -->

2. Build using config:

```bash
npx susee
```

## API Quick Reference

| Surface      | Command / API                    | Purpose                                               | Defaults                                                                                                      |
| ------------ | -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Programmatic | `build(options?)`                | Build from provided options or discovered config file | Exits with code 1 when options and config are both missing                                                    |
| CLI          | `susee`                          | Build using `susee.config.ts/js/mjs` in project root  | Uses resolved config                                                                                          |
| CLI          | `susee init`                     | Create config template in project root                | Prompts for TypeScript project                                                                                |
| CLI          | `susee build <entry> [options]`  | Build a single entry directly from CLI args           | `--outdir dist`, `--format esm`, `--rename true`, `--allow-update false`, `--minify false`, `--warning false` |
| Config       | `entryPoints[].format`           | Output module format(s)                               | `["esm"]`                                                                                                     |
| Config       | `entryPoints[].renameDuplicates` | Rename duplicate declarations                         | `true`                                                                                                        |
| Config       | `entryPoints[].tsconfigFilePath` | Custom tsconfig path                                  | `undefined`                                                                                                   |
| Config       | `entryPoints[].plugins`          | Post-process plugin list                              | `[]`                                                                                                          |
| Config       | `outDir`                         | Root output directory                                 | `"dist"`                                                                                                      |
| Config       | `allowUpdatePackageJson`         | Update package fields based on output                 | `false`                                                                                                       |

## CLI Usage

```txt
Susee CLI.

Usage:
  susee                                 Build using susee.config.{ts,js,mjs}
  susee init                            Generate susee.config.{ts,js,mjs}
  susee --help                          Show this message
  susee build <entry> [options]         Build from a single entry file
```

### CLI Options

```txt
--entry <path>                Entry file (optional if provided as positional <entry>)
--outdir <path>               Output directory (default: dist)
--format <cjs|commonjs|esm>   Output format (default: esm)
--tsconfig <path>             Custom tsconfig path
--rename[=true|false]         Rename duplicate declarations (default: true)
--allow-update[=true|false]   Allow package.json updates (default: false)
--minify[=true|false]         Minify output (default: false)
--warning[=true|false]        Enable warnings (default: false)
```

### CLI Examples

```bash
npx susee build src/index.ts --outdir dist
npx susee build src/index.ts --format commonjs
npx susee build --entry src/index.ts --format esm --minify
```

## Config File

Supported config filenames at project root:

1. `susee.config.ts`
2. `susee.config.js`
3. `susee.config.mjs`

### `SuSeeConfig` shape

```ts
type OutputFormat = ("commonjs" | "esm")[];

interface EntryPoint {
  entry: string;
  exportPath: "." | `./${string}`;
  format?: OutputFormat; // default: ["esm"]
  tsconfigFilePath?: string | undefined; // default: undefined
  renameDuplicates?: boolean; // default: true
  plugins?: unknown[]; // default: []
  warning?: boolean; // default: false
}

interface SuSeeConfig {
  entryPoints: EntryPoint[];
  outDir?: string; // default: "dist"
  allowUpdatePackageJson?: boolean; // default: false
}
```

### Example `susee.config.ts`

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

## Programmatic API

### `build(options?)`

Signature:

```ts
function build(options?: SuSeeConfig): Promise<void>
```

Parameters:

1. `options` (optional): Build options passed directly from code.

Returns:

1. `Promise<void>` that resolves when compilation completes.

Runtime behavior:

1. If `options` is provided, Susee builds from that object.
2. If `options` is omitted, Susee tries to load config from project root.
3. If both are missing, Susee logs an error and exits with code `1`.

```ts
import { build, type SuSeeConfig } from "susee";

const options: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
};

await build(options);
```

## Output Notes

For an entry like `src/index.ts` with both formats enabled, output includes:

1. ESM: `dist/index.mjs`
2. CommonJS: `dist/index.cjs`
3. Sourcemaps: `.mjs.map` and `.cjs.map`

Declaration files are emitted by the compiler when available.

## Build Output Matrix

| Input                                        | Output Directory Rule | ESM Files                                   | CommonJS Files                              |
| -------------------------------------------- | --------------------- | ------------------------------------------- | ------------------------------------------- |
| `entry: "src/index.ts"`, `exportPath: "."`   | `<outDir>`            | `index.mjs`, `index.mjs.map`, `index.d.mts` | `index.cjs`, `index.cjs.map`, `index.d.cts` |
| `entry: "src/foo.ts"`, `exportPath: "./foo"` | `<outDir>/foo`        | `foo.mjs`, `foo.mjs.map`, `foo.d.mts`       | `foo.cjs`, `foo.cjs.map`, `foo.d.cts`       |

Notes:

1. Default `outDir` is `dist` when not set.
2. For subpath exports, output directory is computed as `outDir + exportPath.slice(1)`.
3. Declarations (`.d.mts` / `.d.cts`) are emitted when provided by the underlying compiler result.

## Package.json Update Matrix

When `allowUpdatePackageJson` (config) or `--allow-update` (CLI build) is enabled, Susee can update package fields.

| Context              | Condition                                     | Updated Fields              | Observed Result                                             |
| -------------------- | --------------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| Main export build    | `exportPath: "."` with ESM + CommonJS outputs | `main`, `module`            | `main: "dist/index.cjs"`, `module: "dist/index.mjs"`        |
| Main export build    | `exportPath: "."` with declarations           | `types`                     | Set from generated CommonJS declaration path when available |
| Subpath export build | `exportPath: "./foo"`                         | `exports` (subpath mapping) | Currently remains `{}` in tested behavior                   |

Notes:

1. Package update requires a `package.json` file in the project root.
2. With update disabled, package fields are left unchanged.
3. Existing tests in this repo currently assert `exports` remains `{}` for the tested update flows.

## Validation Rules

From config validation logic:

1. At least one `entryPoints` item is required.
2. Duplicate `exportPath` values are rejected.
3. Each `entry` path must exist.

Violations print an error and exit with code `1`.

## License

[Apache-2.0][license] © [Pho Thin Maung][ptm]

<!-- markdownlint-disable MD053 -->

[license]: LICENSE
[file-contribute]: CONTRIBUTING.md
[ptm]: https://github.com/phothinmg

<!-- Need to update version -->

[sb_img]: https://badge.socket.dev/npm/package/susee/1.5.2
[sb_url]: https://badge.socket.dev/npm/package/susee/1.5.2

<!--  -->

[codecov_img]: https://codecov.io/gh/phothinmg/susee/graph/badge.svg?token=6240Y3L0V1
[codecov_url]: https://codecov.io/gh/phothinmg/susee
[nodei_img]: https://nodei.co/npm/susee.svg?color=red
[nodei_url]: https://nodei.co/npm/susee/
[npm_v_img]: https://img.shields.io/npm/v/susee
[npm_v_url]: https://www.npmjs.com/package/susee
[license_img]: https://img.shields.io/npm/l/susee
