<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee-bg-white.webp" width="160" height="160" alt="susee" />
  <h1>Susee</h1>
</div>
<!-- markdownlint-enable MD033 -->

[![NPM][nodei_img]][nodei_url]

[![npm version][npm_v_img]][npm_v_url] [![license][license_img]](LICENSE) [![mmcov][mmcov_svg]][mmcov_url] [![publish to npm][publish_npm_svg]][publish_npm][![CodeQL Advanced][code_ql_svg]][code_ql] [![OpenSSF Baseline](https://www.bestpractices.dev/projects/13115/baseline)](https://www.bestpractices.dev/projects/13115) [![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13115/badge)](https://www.bestpractices.dev/projects/13115)

## About

A **TypeScript-first** bundler designed specifically for **library packages** that delivers **fast builds**, **type safety**, and **modern JavaScript output** with minimal configuration.

> [!INFO]
> Susee currently depends on the `TypeScript 6` programmatic API.
> Starting with `v1.6.0`, Susee uses `@suseejs/ts6`, a focused fork of `@typescript/typescript6` that exposes the `ts6` runtime Susee needs.
> This keeps Susee's TypeScript API dependency isolated, while allowing your project to install and use `TypeScript 7` alongside it without `tsc` naming conflicts.
> For the best compatibility with this setup, use `Susee v1.6.0` or newer.

---

## Key Features

✅ **TypeScript-first** - Built with TypeScript for maximum type safety

✅ **Dual Output** - Generate both ESM and CommonJS formats automatically

✅ **Duplicate Declaration Detection** - Fails fast when bundled files contain conflicting top-level declarations

✅ **Fast Builds** - Optimized for library packages with minimal overhead

✅ **Package.json Management** - Automatic updates to package.json fields based on the build results

✅ **Plugin System** - Extend functionality with custom plugins

✅ **CLI & Programmatic API** - Use as a CLI tool or integrate directly

✅ **Build Profiling** - Print bundler and compiler phase timings with `--profile`

---

## Installation and Quick Start

### Installation Methods

#### Local Development Dependency (Recommended)

Install `susee` as a development dependency in your project:

```bash
npm i -D susee
```

This method is recommended for library projects as it ensures the bundler version is locked to the project and available for CI/CD pipelines.

#### Global Installation

For system-wide availability of the `susee` CLI:

```bash
npm install -g susee
```

Global installation enables running `susee` directly from any directory without the `npx` prefix.

#### Installation Verification

After installation, verify the package is available by checking the version command:

```bash
npx susee --version
```

---

### Quick Start

### Using config file

The easiest way to start is using the built-in initialization command which generates a configuration template at your project root.This command creates a `susee.config.ts`, `susee.config.js`, or `susee.config.mjs` file.

```bash
npx susee init
```

Build your project by running:

```bash
npx susee
```

### Using Programmatic API

You can trigger the build process within a TypeScript/JavaScript script using the `build()` function.

```typescript
import { build } from "susee";

await build({
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
  outDir: "dist",
  allowUpdatePackageJson: true,
});
```

### Using CLI (Direct Build)

Build a single entry directly without a config file.This method uses default values for options not explicitly provided.

```bash
npx susee build src/index.ts --outdir dist --format esm
```

### Contributor Setup (Repository)

When contributing to this repository, use `npm` to keep installs aligned with `package-lock.json` and npm-based scripts.

```bash
npm install
npm run hooks:install
```

This installs project dependencies and configures local git hooks for commit workflow checks.

---

## Security

Please report vulnerabilities privately and follow the disclosure process in [SECURITY.md](./SECURITY.md).

Do not open public issues for security reports.

---

## API Quick Reference

1. `build(options?)`: Build from the provided options or from a discovered `susee.config.ts/js/mjs` file. If neither exists, Susee exits with code `1`.
2. `suseeBundler(entry)`: Bundle a single entry and return the merged source string. This export does not expose plugin or warning options.
3. `suseeCliBuild()`: Run the CLI dispatcher programmatically using `process.argv`.
4. `susee`: Build from the root config file and clear the configured `outDir` before compiling.
5. `susee init`: Generate a config template in the project root after prompting whether the project uses TypeScript.
6. `susee build <entry> [options]`: Build a single entry directly from CLI arguments. Defaults: `--outdir dist`, `--format esm`, `--warning false`, `--allow-update false`, `--profile false`.
7. `entryPoints[].format`: Output module format list. Default: `["esm"]`.
8. `entryPoints[].tsconfigFilePath`: Custom tsconfig path. Default: `undefined`.
9. `entryPoints[].plugins`: Dependency, pre-process, and post-process plugins. Default: `[]`.
10. `entryPoints[].warning`: Treat dependency graph warnings as fatal. Default: `false`.
11. `outDir`: Root output directory. Default: `"dist"`.
12. `allowUpdatePackageJson`: Update package fields based on generated output. Default: `false`.

---

## CLI Usage

```txt
Susee CLI.

Usage:
  susee                                 Build using susee.config.{ts,js,mjs}
  susee init                            Generate susee.config.{ts,js,mjs}
  susee --version | -v                  Check susee version
  susee --help | -h                     Show this message
  susee build <entry> [options]         Build from a single entry file
```

### CLI Build Options

```txt
--entry <path>                Entry file (optional if provided as positional <entry>)
--outdir <path>               Output directory (default: dist)
--format <cjs|commonjs|esm>   Output format (default: esm)
--tsconfig <path>             Custom tsconfig path
--allow-update[=true|false]   Allow package.json updates (default: false)
--warning[=true|false]        Treat dependency graph warnings as fatal (default: false)
--profile[=true|false]        Print bundler/compiler phase timings (default: false)
```

### CLI Examples

```bash
npx susee build src/index.ts --outdir dist
npx susee build src/index.ts --format commonjs
npx susee build --entry src/index.ts --format esm
npx susee build src/index.ts --profile
```

Notes:

1. `susee build` accepts either a positional `<entry>` or `--entry <path>`.
2. `--profile` is also accepted on plain `susee` config-driven builds.
3. The CLI clears the target `outDir` before writing new output.

---

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
function build(options?: SuSeeConfig): Promise<void>;
```

Parameters:

1. `options` (optional): Build options passed directly from code.

Returns:

1. `Promise<void>` that resolves when compilation completes.

Runtime behavior:

1. If `options` is provided, Susee builds from that object.
2. If `options` is omitted, Susee tries to load config from project root.
3. If both are missing, Susee logs an error and exits with code `1`.
4. Before compiling, Susee clears the configured `outDir`.

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

When `allowUpdatePackageJson` (config) or `--allow-update` (CLI build) is enabled, Susee rewrites package metadata from the emitted file paths.

1. Main export build with `exportPath: "."` and CommonJS output: updates `main` to the generated `.cjs` file.
2. Main export build with `exportPath: "."` and ESM output: updates `module` to the generated `.mjs` file.
3. Main export build with `exportPath: "."` and declarations: updates `types` to the generated declaration file.
4. Any export build with generated import or require declarations: creates or merges `exports` entries for that export path.
5. Any package update: forces `type` to `"module"`.

Notes:

1. Package update requires a `package.json` file in the project root.
2. For subpath exports, Susee merges the generated entry into existing `exports` when that field is an object.
3. For the main export path `.`, Susee replaces `exports` with the generated root mapping.

## Validation Rules

From config validation logic:

1. At least one `entryPoints` item is required.
2. Duplicate `exportPath` values are rejected.
3. Each `entry` path must exist.
4. Duplicate top-level declarations across bundled files fail the build during dependency analysis.
5. CommonJS modules in the dependency tree fail the build unless you handle them with `@suseejs/commonjs-plugin`.

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

[nodei_img]: https://nodei.co/npm/susee.svg?color=red
[nodei_url]: https://nodei.co/npm/susee/
[npm_v_img]: https://img.shields.io/npm/v/susee
[npm_v_url]: https://www.npmjs.com/package/susee
[license_img]: https://img.shields.io/npm/l/susee
[publish_npm]: https://github.com/phothinmg/susee/actions/workflows/npm-publish.yml
[publish_npm_svg]: https://github.com/phothinmg/susee/actions/workflows/npm-publish.yml/badge.svg?event=release
[code_ql]: https://github.com/phothinmg/susee/actions/workflows/codeql.yml
[code_ql_svg]: https://github.com/phothinmg/susee/actions/workflows/codeql.yml/badge.svg
[mmcov_svg]: https://img.shields.io/badge/mmcov-85.01%25-green?style=flat&labelColor=%232c3e50
[mmcov_url]: https://suseejs.org/coverage
