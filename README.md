<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee-bg-white.webp" width="160" height="160" alt="susee" />
  <h1>Susee</h1>
</div>
<!-- markdownlint-enable MD033 -->

[![NPM][nodei_img]][nodei_url]

[![npm version][npm_v_img]][npm_v_url] [![license][license_img]](LICENSE)[![publish to npm][publish_npm_svg]][publish_npm][![OpenSSF Baseline](https://www.bestpractices.dev/projects/13115/baseline)](https://www.bestpractices.dev/projects/13115) [![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13115/badge)](https://www.bestpractices.dev/projects/13115)

## About

A **TypeScript-first** bundler designed specifically for **library packages** that delivers **fast builds**, **type safety**, and **modern JavaScript output** with minimal configuration.

> [!NOTE]
>
> - Starting with **v2.0.0**, Susee's core is written in **Rust** and compiled to a native Node.js addon via **N-API** (`@napi-rs/cli`). The compiler, bundler, and minifier all run in native code for maximum performance.
> - The output JavaScript is minified with the **[oxc](https://oxc.rs) minifier** when `minify` is enabled.
> - Config files use the **JSONC** format (`susee.config.jsonc`).

---

## Key Features

✅ **Rust-powered core** — Bundler, compiler, and minifier run natively via N-API

✅ **TypeScript-first** — Built for maximum type safety

✅ **Dual Output** — Generate both ESM and CommonJS formats automatically

✅ **Duplicate Declaration Detection** — Fails fast when bundled files contain conflicting top-level declarations

✅ **Fast Builds** — Optimized for library packages with minimal overhead

✅ **Built-in Minification** — Minify output JavaScript with the oxc minifier

✅ **Package.json Management** — Automatic updates to package.json fields based on the build results

✅ **Plugin System** — Extend functionality with custom plugins

✅ **CLI & Programmatic API** — Use as a CLI tool or integrate directly

✅ **Build Profiling** — Print bundler and compiler phase timings with `--profile`

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

The easiest way to start is using the built-in initialization command which generates a configuration template at your project root. This command creates a `susee.config.jsonc` file.

```bash
npx susee init
```

Build your project by running:

```bash
npx susee
```

### Using Programmatic API (Node.js)

You can trigger the build process within a JavaScript/TypeScript script using the `suseeBuild()` N-API function.

```typescript
import { suseeBuild } from "susee";

suseeBuild({
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
  outDir: "dist",
  allowUpdatePackageJson: true,
  minify: true,
});
```

### Using CLI (Direct Build)

Build a single entry directly without a config file. This method uses default values for options not explicitly provided.

```bash
npx susee build src/index.ts --outdir dist --format esm --minify
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

## N-API (Node.js) Exports

Susee's Rust core is exposed to Node.js via N-API (`@napi-rs/cli`). The following functions and types are available:

### `suseeBuild(config?)`

Build from the provided config object or from a discovered `susee.config.jsonc` file. If neither exists, Susee logs an error and exits with code `1`.

```ts
import { suseeBuild, type SuSeeConfig } from "susee";

// Build from an explicit config object
suseeBuild({
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
    },
  ],
  outDir: "dist",
  allowUpdatePackageJson: false,
  minify: true,
});

// Build from susee.config.jsonc (config omitted)
suseeBuild();
```

| Parameter       | Type                        | Required | Default | Description                                      |
| --------------- | --------------------------- | -------- | ------- | ------------------------------------------------ |
| `config`        | `SuSeeConfig \| undefined`   | No       | —       | Build options. If omitted, loads config file.    |

### `cliBuild(args)`

Run the CLI dispatcher programmatically. Pass `process.argv.slice(2)` from the JavaScript side.

```ts
import { cliBuild } from "susee";

cliBuild(process.argv.slice(2));
```

| Parameter | Type         | Required | Description                                                        |
| --------- | ------------ | -------- | ------------------------------------------------------------------ |
| `args`    | `string[]`   | Yes      | CLI arguments (typically `process.argv.slice(2)`).               |

### `suseeBundler(entry)`

Bundle a single entry and return the merged source string. This export does not expose plugin or warning options.

```ts
import { suseeBundler } from "susee";

const bundled = suseeBundler("src/index.ts");
console.log(bundled);
```

| Parameter | Type     | Required | Description                               |
| --------- | -------- | -------- | ----------------------------------------- |
| `entry`   | `string` | Yes      | Entry file path relative to project root. |

**Returns:** `string` — the bundled source code.

### `OutputFormat` (enum)

N-API enum representing the output module format.

```ts
enum OutputFormat {
  Esm = "esm",
  Commonjs = "commonjs",
}
```

### `SuSeeConfig` (object)

```ts
interface SuSeeConfig {
  entryPoints: EntryPoint[];
  outDir?: string;                 // default: "dist"
  allowUpdatePackageJson?: boolean; // default: false
  minify?: boolean;                // default: false
}
```

### `EntryPoint` (object)

```ts
interface EntryPoint {
  entry: string;
  exportPath: string;             // "." or "./sub/path"
  format?: OutputFormat[];         // default: ["esm"]
  tsconfigFilePath?: string | null; // default: null
  warning?: boolean;               // default: false
}
```

---

## Rust API

The Rust core library exposes the following public functions and types via the `susee` crate:

### `core::build(config: Option<&SuSeeConfig>)`

Top-level build entry point. When `config` is `None`, the config is loaded from `susee.config.jsonc` in the current directory.

```rust
use susee::{SuSeeConfig,susee_build};

// Build from config file
core::build(None);

// Build from explicit config
let config = SuSeeConfig {
    entry_points: vec![susee::core::EntryPoint {
        entry: "src/index.ts".to_string(),
        export_path: ".".to_string(),
        format: Some(vec![susee::core::OutputFormat::Esm]),
        tsconfig_file_path: None,
        warning: Some(false),
    }],
    out_dir: Some("dist".to_string()),
    allow_update_package_json: Some(false),
    minify: Some(true),
};
susee_build(Some(&config));
```

### `core::susee_build(config: &SuSeeConfig) -> Result<(), String>`

Build from a config reference. Returns `Ok(())` on success or an error string on failure.

```rust
use susee::{susee_build, SuSeeConfig, EntryPoint, OutputFormat};

let config = SuSeeConfig {
    entry_points: vec![EntryPoint {
        entry: "src/index.ts".to_string(),
        export_path: ".".to_string(),
        format: Some(vec![OutputFormat::Esm, OutputFormat::Commonjs]),
        tsconfig_file_path: None,
        warning: Some(false),
    }],
    out_dir: Some("dist".to_string()),
    allow_update_package_json: Some(false),
    minify: Some(true),
};

susee_build(&config).expect("build failed");
```

### `core::bundler(entry: &str, cwd: &str) -> std::io::Result<BundleResult>`

Bundle a single entry and return the merged source string along with project type metadata.

```rust
use susee::core::bundler;

let result = bundler("src/index.ts", ".")?;
println!("{}", result.bundled_code);
```

### `core::susee_cli_build_with_args(args: Vec<String>)`

CLI dispatcher with explicit args. Reads `std::env::args_os().skip(1)` for the standalone binary, or accepts args passed from the N-API layer.

```rust
use susee::core::susee_cli_build_with_args;

susee_cli_build_with_args(vec!["build".to_string(), "src/index.ts".to_string()]);
```

### Rust Types

#### `SuSeeConfig`

```rust
pub struct SuSeeConfig {
    pub entry_points: Vec<EntryPoint>,
    pub out_dir: Option<String>,
    pub allow_update_package_json: Option<bool>,
    pub minify: Option<bool>,
}
```

#### `EntryPoint`

```rust
pub struct EntryPoint {
    pub entry: String,
    pub export_path: String,
    pub format: Option<Vec<OutputFormat>>,
    pub tsconfig_file_path: Option<String>,
    pub warning: Option<bool>,
}
```

#### `OutputFormat`

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Commonjs, // serialized as "commonjs"
    Esm,      // serialized as "esm"
}
```

#### `BuildOptions` (internal)

```rust
pub struct BuildOptions {
    pub build_entry_points: Vec<BuildEntryPoint>,
    pub update_package: bool,
    pub out_dir: String,
    pub minify: bool,
}
```

### Cargo.toml

```toml
[dependencies]
susee = "2"
```

---

## CLI Usage

```txt
Susee CLI.

Usage:
  susee                                 Build using susee.config.jsonc
  susee init                            Generate susee.config.jsonc
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
--minify[=true|false]         Minify output JavaScript code (default: false)
```

### CLI Examples

```bash
npx susee build src/index.ts --outdir dist
npx susee build src/index.ts --format commonjs
npx susee build --entry src/index.ts --format esm
npx susee build src/index.ts --profile --minify
npx susee --profile
```

Notes:

1. `susee build` accepts either a positional `<entry>` or `--entry <path>`.
2. `--profile` is also accepted on plain `susee` config-driven builds.
3. `--minify` enables the oxc minifier on the emitted JavaScript output.
4. The CLI clears the target `outDir` before writing new output.

---

## Config File

The config file uses the **JSONC** format (JSON with comments) and must be named:

- `susee.config.jsonc`

### `susee.config.jsonc` example

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

### Config schema

| Field                    | Type         | Required | Default     | Description                                  |
| ----------------------- | ------------ | -------- | ----------- | -------------------------------------------- |
| `entryPoints`           | `EntryPoint[]` | Yes    | —           | List of entry points to build.               |
| `outDir`                | `string`     | No       | `"dist"`   | Root output directory.                       |
| `allowUpdatePackageJson`| `boolean`    | No       | `false`    | Update package.json from build output.       |
| `minify`                | `boolean`    | No       | `false`    | Minify emitted JS with the oxc minifier.     |
| `entryPoints[].entry`   | `string`     | Yes      | —           | Entry file path.                             |
| `entryPoints[].exportPath` | `string`   | Yes      | —           | Package export path (`.` or `./sub`).        |
| `entryPoints[].format`  | `string[]`   | No       | `["esm"]`  | Output formats: `"esm"`, `"commonjs"`.      |
| `entryPoints[].tsconfigFilePath` | `string\|null` | No | `null` | Custom tsconfig path.                   |
| `entryPoints[].warning` | `boolean`    | No       | `false`    | Treat dependency warnings as fatal.          |

---

## Output Notes

For an entry like `src/index.ts` with both formats enabled, output includes:

1. ESM: `dist/index.mjs`
2. CommonJS: `dist/index.cjs`
3. Type declarations: `dist/index.d.mts` and `dist/index.d.cts`
4. Sourcemaps: `dist/index.mjs.map` and `dist/index.cjs.map`

When `minify` is enabled, the ESM and CommonJS output files are minified using the **oxc** minifier.

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
[mmcov_svg]: https://img.shields.io/badge/mmcov-85.01%25-green?style=flat&labelColor=%232c3e50
[mmcov_url]: https://suseejs.org/coverage
