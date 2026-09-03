---
layout: docs
label: guide
title: Quick Start
---

## Prerequisites

Before you begin, make sure your project already has:

- Node.js and npm
- A TypeScript source entry, such as `src/index.ts`

Susee can be used as a CLI tool or from code through its API.

## Install susee

Install susee as a development dependency in your package:

```sh
npm i -D susee
```

Check that installation works:

```sh
npx susee --version
```

## Create a config file

Generate a starter config file in your project root:

```sh
npx susee init
```

The interactive prompt will ask whether your project uses TypeScript. If yes, it generates `susee.config.ts`. If no, it generates `susee.config.js` (for ESM projects) or `susee.config.mjs` (for CommonJS projects).

## Define your package entries

Example `susee.config.ts`:

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

## Build with config

Run susee from your project root:

```bash
npx susee build
```

Susee reads your config file, builds each entry, and writes output to `dist` by default.

## Build directly from CLI (without config)

For quick one-off builds, use the direct build command:

```bash
npx susee build src/index.ts --outdir dist --format esm
```

Common options:

- `--entry <path>` — Entry file (optional if provided as positional argument)
- `--outdir <path>` — Output directory (default: `dist`)
- `--format <cjs|commonjs|esm|both>` — Output format (default: `esm`)
- `--tsconfig <path>` — Custom tsconfig path
- `--allow-update[=true|false]` — Allow package.json updates (default: `false`)
- `--minify[=true|false]` — Minify output JS with the oxc minifier (default: `false`)
- `--check[=true|false]` — Enable bundler lint checks (default: `false`)

If the bundled dependency set contains conflicting top-level declarations, Susee fails the build and reports the conflict instead of renaming identifiers automatically.

## Use the programmatic API

You can also run builds from scripts. The `susee` package exports the `build` function and the `SuSeeConfig` type:

```ts
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

## Verify output

After build, confirm:

- Output files are generated in your configured `outDir`
- ESM and/or CommonJS artifacts exist as expected
- Type declarations are available for consumers
