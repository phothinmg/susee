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

Generate a starter `susee.config.jsonc` in your project root:

```sh
npx susee init
```

The generated file uses JSONC (JSON with comments), so you can annotate each field inline.

## Define your package entries

Example `susee.config.jsonc`:

```jsonc
{
  // Entry points to bundle
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm", "commonjs"]
    }
  ],
  "outDir": "dist",
  "allowUpdatePackageJson": false
}
```

## Build with config

Run susee from your project root:

```bash
npx susee
```

Susee reads your `susee.config.jsonc`, builds each entry, and writes output to `dist` by default.

## Build directly from CLI (without config)

For quick one-off builds, use the direct build command:

```bash
npx susee build src/index.ts --outdir dist --format esm
```

Common options:

- `--format <esm|commonjs|cjs>`
- `--outdir <path>`
- `--tsconfig <path>`
- `--allow-update[=true|false]`
- `--warning[=true|false]`
- `--minify[=true|false]`
- `--profile[=true|false]`

If the bundled dependency set contains conflicting top-level declarations, Susee fails the build and reports the conflict instead of renaming identifiers automatically.

## Use the programmatic API

You can also run builds in scripts. The native addon exposes `suseeBuild`, `cliBuild`, and `suseeBundler`:

```ts
const { suseeBuild } = require("susee");

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
  minify: false,
});
```

## Verify output

After build, confirm:

- Output files are generated in your configured `outDir`
- ESM and/or CommonJS artifacts exist as expected
- Type declarations are available for consumers
