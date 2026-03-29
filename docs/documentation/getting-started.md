# Getting Started

## Installation

Install as a development dependency :

::: code-group

```sh [npm]
npm i -D susee
```

```sh [pnpm]
pnpm add -D susee
```

```sh [yarn]
yarn add -D susee vue
```

```sh [bun]
bun add -D susee
```

:::

## Quick Start

### Create config

Run the following command to create minimal susee config (`susee.config.ts`, `susee.config.mjs`,`susee.config.js`) base on your project.

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

### Edit Config

Replace , Edit , Uncomment the `susee.config.{ts,js,mjs}` file.

```js
const config = {
  // Array of entry point objects.
  // ----------------------------
  entryPoints: [
    // You can add more entry points for different export paths.
    // NOTE: duplicate export paths are not allowed.
    // --------------------------------------------
    {
      // (required) Entry file path.
      entry: "src/index.ts", // replace with your entry file
      // (required) Export path for this entry.
      exportPath: ".", // "." stands for the main export path and can be set to "./foo", "./bar", etc.
      // (optional) Output module formats ["commonjs"] or ["esm", "commonjs"], default: ["esm"].
      // Uncomment the following line to edit.
      //format: ["esm"],
      // (optional) Rename duplicate declarations, default: true.
      // Uncomment the following line to edit.
      //renameDuplicates: true,
      // (optional) Custom tsconfig.json path, default: undefined.
      // Uncomment the following line to edit.
      //tsconfigFilePath: undefined,
    },
  ],
  // NOTE: the following options apply to all entry points.
  // ----------------------------------------------------------
  // (optional) Output directory, default: dist.
  // Uncomment the following line to edit.
  //outDir: "dist",
  // (optional) Array of susee plugins, default: [].
  // Uncomment the following line to edit.
  //plugins: [],
  // (optional) Allow susee to update your package.json, default: false.
  // Uncomment the following line to edit.
  //allowUpdatePackageJson: false,
};
```

### Running Your First Build

via package manager :

::: code-group

```sh [npm]
npx susee
```

```sh [pnpm]
pnpm susee
```

```sh [yarn]
yarn susee
```

```sh [bun]
bun susee
```

:::

via script in `package.json`

```json
{
  "scripts": {
    "build": "susee"
  }
}
```
