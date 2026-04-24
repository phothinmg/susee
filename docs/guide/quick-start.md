# Quick Start

## Prerequisites

Before you begin, make sure your project already has:

- Node.js and npm
- A TypeScript source entry, such as `src/index.ts`

Susee can be used as a CLI tool or from code through its API.

## 1. Install susee

Install susee as a development dependency in your package:

::: code-group

```sh [npm]
npm i -D susee
```

```sh [pnpm]
pnpm add -D susee
```

```sh [yarn]
yarn add -D susee
```

```sh [bun]
bun add -D susee
```

:::

Check that installation works:

::: code-group

```sh [npm]
npx susee --version
```

```sh [pnpm]
pnpm susee --version
```

```sh [yarn]
yarn susee --version
```

```sh [bun]
bun susee --version
```

:::

## 2. Create a config file

Generate a starter config in your project root:

::: code-group

```sh [npm]
npx susee init
```

```sh [pnpm]
pnpm susee init
```

```sh [yarn]
yarn susee init
```

```sh [bun]
bun susee init
```

:::

<<< init.ansi

Supported config filenames:

1. `susee.config.ts`
2. `susee.config.js`
3. `susee.config.mjs`

## 3. Define your package entries

Example `susee.config.ts`:

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
      renameDuplicates: true,
    },
  ],
  outDir: "dist",
  allowUpdatePackageJson: false,
};

export default config;
```

## 4. Build with config

Run susee from your project root:

```bash
npx susee
```

Susee reads your `susee.config.*`, builds each entry, and writes output to `dist` by default.

## 5. Build directly from CLI (without config)

For quick one-off builds, use the direct build command:

```bash
npx susee build src/index.ts --outdir dist --format esm
```

Common options:

- `--format <esm|commonjs|cjs>`
- `--outdir <path>`
- `--rename[=true|false]`
- `--allow-update[=true|false]`
- `--minify[=true|false]`

## 6. Use the programmatic API

You can also run builds in scripts:

```ts
import { build } from "susee";

await build({
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      format: ["esm", "commonjs"],
      renameDuplicates: true,
    },
  ],
  outDir: "dist",
  allowUpdatePackageJson: true,
});
```

## 7. Verify output

After build, confirm:

- Output files are generated in your configured `outDir`
- ESM and/or CommonJS artifacts exist as expected
- Type declarations are available for consumers
