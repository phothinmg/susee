<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee.webp" width="160" height="160" alt="susee" />
  <h1>Susee</h1>
</div>
<!-- markdownlint-enable MD033 -->

[![npm version](https://img.shields.io/npm/v/susee)](https://www.npmjs.com/package/susee) [![license](https://img.shields.io/npm/l/susee)](LICENSE) [![Socket Badge](https://badge.socket.dev/npm/package/susee/1.0.1)](https://badge.socket.dev/npm/package/susee/1.0.1) [![codecov](https://codecov.io/gh/phothinmg/susee/graph/badge.svg?token=6240Y3L0V1)](https://codecov.io/gh/phothinmg/susee)

## About

**Susee** is a simple TypeScript bundler designed for `npm` library authorship (_not application bundler_) that processes a package's local dependency tree and emits compiled artifacts in multiple module formats and collates local TypeScript files, merges them into cohesive bundles, compiles them through the TypeScript compiler, and generates properly formatted outputs for consumption as `npm` packages.

## Key Features

1. **Dependency Tree Resolution** : automatically resolves and collects local TypeScript dependencies starting from specified entry points.

2. **Dual-Format Module Output** : generates outputs for both ESM and CommonJS module systems from a single TypeScript source.

3. **File Extension Conventions** : dual-emit conventions for unambiguous module format identification.

   | Module Format | JavaScript Extension | Type Definition Extension |
   | ------------- | -------------------- | ------------------------- |
   | ESM           | `.mjs`               | `.d.mts`                  |
   | CommonJS      | `.cjs`               | `.d.cts`                  |

4. **Automatic package.json Management** : conditionally updates package.json fields based on compilation outputs, this feature is controlled by the `allowUpdatePackageJson` boolean in `SuSeeConfig`.

## Installation

Install as a development dependency :

```bash
npm install susee --save-dev
```

Global install:

```bash
npm install -g susee
```

## Quick Start

The `susee` CLI binary is exposed through the `bin` field and becomes available immediately after installation.

### Creating a Minimal Configuration

Create a file named `susee.config.ts` in your project root:

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: "both",
    },
  ],
};

export default config;
```

### Running Your First Build

Execute the bundler using one of these methods:

#### CLI Execution

with `npx` :

```bash
npx susee
```

via `package.json` :

```json
{
  "scripts": {
    "build": "susee"
  }
}
```

```bash
npm run build
```

for global :

```bash
susee
```

#### Programmatic Execution

```ts
import { susee } from "susee";

await susee();
```

The `susee()` function is an asynchronous operation that:

1. Loads configuration from `susee.config.ts`
2. Resolves the dependency tree
3. Bundles local dependencies
4. Compiles to target formats
5. Optionally updates `package.json`

## Configuration summary

### Top-Level Configuration Fields

#### entryPoints

An array of [EntryPoint](#entrypoint-structure) objects defining the files to bundle. Each entry point represents a separate bundling operation with its own entry file, export path, and output configuration. The array must contain at least one entry point.

#### plugins (optional)

An optional array of plugin instances that provide transformation hooks. Plugins can be objects or factory functions and execute at different stages of the bundling pipeline (dependency, pre-process, post-process). Defaults to `[]` if not specified.

#### allowUpdatePackageJson (optional)

Controls whether `susee` automatically updates the `package.json` file with generated `exports`, `main` fields, and `module` fields. When `true`, susee modifies the `package.json` to reflect the bundled outputs. When `false`, `package.json` remains unchanged.
Defaults to `true` if not specified.

#### outDir (optional)

Specifies the base output directory where compiled files are written. This can be overridden per entry point if needed (though the current implementation uses a global outDir). Defaults to `"dist"` if not specified.

### EntryPoint Structure

Each entry point in the [entryPoints](#entrypoints) array defines a separate bundling target. The EntryPoint interface specifies the following fields:

**entry**: The file path to the TypeScript entry file. This path is validated during configuration loading to ensure the file exists

**exportPath**: The package export path where this bundle will be exposed. Use "." for the main package export, or subpath like "./config" for additional exports. Duplicate export paths across entry points are not allowed and will cause validation failure.

**format (optional)**: Determines which module format(s), `commonjs`,`esm` or both `esm`and `commonjs` to generate.
Defaults to `esm` if not specified.

**tsconfigFilePath (optional)**: Optional path to a custom TypeScript configuration file for this specific entry point. If not specified, susee will resolve for TypesScript compiler options as follow :

Priority -

1. this custom `tsconfig.json`

2. `tsconfig.json` at root directory

3. default compiler options of `susee`

Notes: You can control TypesScript compiler options from `tsconfig.json` except , `rootDir` , `outDir`,`module`.

**renameDuplicates (optional)**: Controls whether susee automatically renames duplicate identifiers during the bundling process to avoid naming conflicts when merging files.(default to `true`).If you want to rename your self set to `false`, process will exit with code-1 and print where duplicate found.

## Plugins

Plugins in the ecosystem have three common types:

- `dependency` — transform dependency list before bundling
- `pre-process` — modify the joined bundle text before compilation
- `post-process` — modify emitted output files

Plugins may be provided as objects or factories (functions returning the plugin). They may be synchronous or async — the bundler handles both.

## package.json updates

When `allowUpdatePackageJson` is enabled, susee will:

- set `type` to `module` (to ensure ESM compatibility)
- add/update `main`, `module`, `types` and `exports` for the main export when building the package root
- merge subpath exports for non-root `exportPath`s without overwriting unrelated exports

Output file name hints (produced by the compiler):

- ESM JS -> `.mjs`
- ESM types -> `.d.mts`
- CJS JS -> `.cjs`
- CJS types -> `.d.cts`

## Limitations & notes

- The bundler only processes local TypeScript files and does not bundle `node_modules` packages.
- Only support `.ts` , `.mts` and `.cts` file extensions.
- The entry file should be an ESM-compatible TypeScript file.
- Exports from the entry file are not removed — only dependency exports may be stripped during bundling.

## Roadmap

Current environment support:

- Node.js only.

Planned work:

- [ ] Add first-class support for Deno environments.
- [ ] Add browser-oriented library build support.
- [ ] Improve workflows for building React-related libraries.

## Contributing and tests

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow, pull request checklist, and development guidelines.

- Build and run tests with the repo scripts (see `package.json`):

```bash
npm run build
npm test
```

## License

[Apache-2.0][license] © [Pho Thin Maung][ptm]

<!-- markdownlint-disable MD053 -->

[license]: LICENSE
[ptm]: https://github.com/phothinmg
