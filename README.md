<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee.webp" width="160" height="160" alt="susee" />
  <h1>Susee</h1>
</div>
<!-- markdownlint-enable MD033 -->

[![NPM][nodei_img]][nodei_url]

[![npm version][npm_v_img]][npm_v_url] [![license][license_img]](LICENSE) [![Socket Badge][sb_img]][sb_url] [![codecov][codecov_img]][codecov_url]

## Overview

Susee is a TypeScript-first bundler for library packages.

It reads `susee.config.{ts,js,mjs}`, resolves the dependency graph for each entry,
bundles sources into a single unit, then compiles output for ESM and/or CommonJS with types.

## Features

- Loads config from one of:
  - `susee.config.ts`
  - `susee.config.js`
  - `susee.config.mjs`
- Supports multiple entry points with subpath exports (`.` and `./subpath`).
- Validates and type-checks dependency files before bundling.
- Runs dependency, pre-process, and post-process plugins (sync or async).
- Compiles to:
  - ESM (`.mjs`, `.d.mts`, source maps)
  - CommonJS (`.cjs`, `.d.cts`, source maps)
- Can update `package.json` fields (`type`, `main`, `module`, `types`, `exports`) when `allowUpdatePackageJson` is enabled.

## Current Constraints

- CommonJS dependencies in the source graph are rejected by core (suggested workaround: `@suseejs/plugin-commonjs`).
- JSX/TSX dependencies are currently rejected.
- CLI supports only `susee` and `susee init`.

## Installation and Quick Start

### Install

```sh
npm i -D susee
```

### Create a config file

```sh
npx susee init
```

### Build your first project

Use the CLI:

```sh
npx susee
```

Or in `package.json`:

```json
{
  "scripts": {
    "build": "susee"
  }
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
  binary?: { name: string };
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
- `types` includes `node`
- `lib` includes `ESNext`

## Plugin Hooks

Susee supports these plugin stages:

- `dependency`
  - receives resolved dependency files and compiler options
  - transforms dependency metadata/content before bundling
- `pre-process`
  - receives bundled code before compilation
- `post-process`
  - receives emitted JS output content per file

Both sync and async plugins are supported.

## Output Behavior

- `format: ["esm"]`
  - emits `.mjs` and `.d.mts`
- `format: ["commonjs"]`
  - emits `.cjs` and `.d.cts`
- `format: ["esm", "commonjs"]`
  - emits both sets

When `allowUpdatePackageJson` is `true`, Susee can update:

- `type` (forced to `module`)
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

## Local Development

Common project scripts:

```bash
npm run build
npm run test
npm run lint
npm run fmt
npm run hooks:install
```

Notes:

- `npm run test` opens an interactive selector (`scripts/susee-tests.ts`).
- Git hooks are tracked in `.githooks` and installed via `npm run hooks:install`.

## Contributing

Contributions are welcome for bug fixes, features, documentation, and code quality improvements.

See detail in [CONTRIBUTING.md][file-contribute]

## License

[Apache-2.0][license] © [Pho Thin Maung][ptm]

<!-- markdownlint-disable MD053 -->

[license]: LICENSE
[file-contribute]: CONTRIBUTING.md
[ptm]: https://github.com/phothinmg

<!-- Need to update version -->

[sb_img]: https://badge.socket.dev/npm/package/susee/1.5.1
[sb_url]: https://badge.socket.dev/npm/package/susee/1.5.1

<!--  -->

[codecov_img]: https://codecov.io/gh/phothinmg/susee/graph/badge.svg?token=6240Y3L0V1
[codecov_url]: https://codecov.io/gh/phothinmg/susee
[nodei_img]: https://nodei.co/npm/susee.svg?color=red
[nodei_url]: https://nodei.co/npm/susee/
[npm_v_img]: https://img.shields.io/npm/v/susee
[npm_v_url]: https://www.npmjs.com/package/susee
[license_img]: https://img.shields.io/npm/l/susee
