<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee.webp" width="160" height="160" alt="susee" />
  <h1>Susee</h1>
</div>
<!-- markdownlint-enable MD033 -->

[![npm version](https://img.shields.io/npm/v/susee)](https://www.npmjs.com/package/susee) [![license](https://img.shields.io/npm/l/susee)](LICENSE) [![Socket Badge](https://badge.socket.dev/npm/package/susee/1.0.1)](https://badge.socket.dev/npm/package/susee/1.0.1) [![codecov](https://codecov.io/gh/phothinmg/susee/graph/badge.svg?token=6240Y3L0V1)](https://codecov.io/gh/phothinmg/susee)

## Overview

Susee is a simple TypeScript bundler for library packages.

It reads your project entry points from `susee.config.*`, builds a dependency graph,
bundles each entry into a single source unit, and compiles outputs to ESM and/or CommonJS
with declaration files.

### What It Does

- Loads config from one of:
  - `susee.config.ts`
  - `susee.config.js`
  - `susee.config.mjs`
- Resolves dependencies from each configured `entry`.
- Validates code with TypeScript before bundling.
- Bundles dependency files + entry file in dependency order.
- Compiles to:
  - ESM (`.mjs`, `.d.mts`, source maps)
  - CommonJS (`.cjs`, `.d.cts`, source maps)
- Optionally updates `package.json` fields (`main`, `module`, `types`, `exports`).

### Current Constraints

- CommonJS dependencies inside the source graph are rejected unless handled by a plugin.
- JSX/TSX dependencies are currently rejected.
- CLI supports only:
  - `susee`
  - `susee init`

## Installation and Quick Start

### Install

```sh
npm i -D susee
```

### Create minimal susee config file

```sh
npx susee init
```

### Build your fist project

via CLI :

```sh
npx susee
```

via `package.json` :

```json
{
  "script": "susee"
}
```

## Config Reference

`SuSeeConfig`

```ts
interface SuSeeConfig {
  entryPoints: EntryPoint[];
  outDir?: string; // default: "dist"
  plugins?: (SuseePlugin | SuseePluginFunction)[]; // default: []
  allowUpdatePackageJson?: boolean; // default: false
}
```

`EntryPoint`

```ts
type OutputFormat = ("commonjs" | "esm")[];

interface EntryPoint {
  entry: string;
  exportPath: "." | `./${string}`;
  format?: OutputFormat; // default: ["esm"]
  tsconfigFilePath?: string;
  renameDuplicates?: boolean; // default: true
}
```

### Entry Validation Rules

- At least one `entryPoint` is required.
- Duplicate `exportPath` values are rejected.
- Each `entry` file must exist.

### TypeScript Options Behavior

For each entry point, Susee builds compiler options from:

1. `tsconfigFilePath` (if provided)
2. project `tsconfig.json`
3. Susee defaults

Susee enforces/adjusts key options internally:

- `moduleResolution: "NodeNext"`
- `allowJs: true`
- `outDir` set per entry output path
- ensures `types` includes `node`
- ensures `lib` includes `ESNext`

## Plugin Hooks

Susee supports plugin stages used in the pipeline:

- `dependency`
  - receives resolved dependency files and compiler options
  - can transform dependency metadata/content before bundling
- `pre-process`
  - receives bundled code (string) before compilation
- `post-process`
  - receives emitted JS file content per output file

Both sync and async plugins are supported.

## Output Behavior

- `format: ["esm"]`
  - emits `.mjs` and `.d.mts`
- `format: ["commonjs"]`
  - emits `.cjs` and `.d.cts`
- `format: ["esm", "commonjs"]`
  - emits both sets

When `allowUpdatePackageJson` is `true`, Susee can update:

- `type` (set to `module`)
- `main`
- `module`
- `types`
- `exports` (including subpath exports from `exportPath`)

## CLI

```bash
susee
susee init
```

Any other argument combination exits with an error.

## Contributing

Contributions are welcome for bug fixes, features, documentation, and code quality improvements.

See detail in [CONTRIBUTING.md][file-contribute]

## License

[Apache-2.0][license] © [Pho Thin Maung][ptm]

<!-- markdownlint-disable MD053 -->

[license]: LICENSE
[file-contribute]: CONTRIBUTING.md
[ptm]: https://github.com/phothinmg
