<div align="center">
	<img src="https://pub-d94f06e647584b8496cac0d43a6fecfb.r2.dev/susee/susee.webp" width="160" height="160" alt="susee" />
	<h1>susee</h1>
</div>

A minimal bundler for TypeScript projects that emits CommonJS, ESM, and type declarations in one pass. It streamlines package exports and auto-updates `package.json`.

## Features

- Bundles a TypeScript entry with its dependency tree
- Outputs CommonJS (.cjs) and ESM (.mjs) builds with type declarations
- Auto-writes `package.json` fields (`main`, `module`, `types`, `exports`) and change `type` force to `module`.
- You can create post-process hooks (sync/async) for code that bundled and transformed by Typescript API.
- Limitations: Only supports esm entry and typescript extensions.
- Does not remove exports from the entry file and does not bundle packages from `node_modules`.

## Installation

```bash
npm i susee
```

## Usage

`susee.config.ts` at root of project

<div align="center">
  <h1>susee</h1>
</div>

susee is a small TypeScript bundler that collates a package's local dependency tree, then emits compiled artifacts for ESM and/or CommonJS along with type definitions. It can also update `package.json` exports automatically for main and subpath exports.

**Key points**
- Produces ESM (`.mjs`) and/or CommonJS (`.cjs`) outputs and corresponding type files (`.d.mts` / `.d.cts`).
- Merges local dependency files into a single bundled input for the TypeScript compiler.
- Supports simple plugin hooks at multiple stages: `dependency`, `pre-process`, and `post-process`.
- When enabled, updates `package.json` fields (`type`, `main`, `module`, `types`, `exports`) for the main export and merges subpath exports.

## Installation

```bash
npm install susee
```

## Usage

CLI (global or npx):

```bash
npx susee
```

programmatic (exports):

```ts
import { susee } from "susee";

await susee();
```

## Configuration

Place a `susee.config.ts` at your project root. The config defines entry points and optional hooks.

Example `susee.config.ts`:

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: "both", // "esm" | "commonjs" | "both"
      renameDuplicates: true,
      outDir: "dist",
    },
  ],
  postProcessHooks: [], // optional plugins
  allowUpdatePackageJson: true,
};

export default config;
```

Config summary:
- `entryPoints`: array of entry definitions
  - `entry` — path to entry file (required)
  - `exportPath` — `.` or a subpath like `./feature`
  - `format` — `esm` | `commonjs` | `both` (defaults to `esm`)
  - `tsconfigFilePath` — optional custom tsconfig for that entry
  - `renameDuplicates` — whether to auto-rename duplicate identifiers
  - `outDir` — where compiled files will be written (e.g. `dist`)
- `postProcessHooks` — array of `post-process` plugins (sync or async)
- `allowUpdatePackageJson` — when true, `package.json` is updated with produced entry points

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
- The entry file should be an ESM-compatible TypeScript file.
- Exports from the entry file are not removed — only dependency exports may be stripped during bundling.

## Contributing and tests

- Build and run tests with the repo scripts (see `package.json`):

```bash
npm run build
npm test
```

## License

Apache-2.0
