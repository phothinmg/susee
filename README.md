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

```ts
import type { SuSeeConfig } from "susee";
import bannerTextHook from "@suseejs/banner-text";

const license = "/*! My Library */";

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      exportPath: ".",
      moduleType: "both",
    },
  ],
  postProcessHooks: [bannerTextHook(licenseText)],
} as SuSeeConfig;
```

### Bundle in terminal

```bash
npx susee
```

### `package.json`

```json
{
  "scripts": {
    "build": "susee"
  }
}
```

## Configuration for Susee Bundler

```ts
interface EntryPoint {
  /**
   * Entry of file path of package
   *
   * required
   */
  entry: string;
  /**
   * Export path for package
   *
   * required
   */
  exportPath: "." | `./${string}`;
  /**
   * Output module type of package , commonjs,esm or both esm and commonjs
   *
   * default - esm
   */
  moduleType?: "commonjs" | "esm" | "both";
  /**
   * Custom tsconfig.json path for package typescript compiler options
   *
   * Priority -
   *  1. this custom tsconfig.json
   *  2. tsconfig.json at root directory
   *  3. default compiler options of susee
   *
   * default - undefined
   */
  tsconfigFilePath?: string | undefined;
}

/**
 * Configuration for Susee Bundler
 */
interface SuSeeConfig {
  /**
   * Array of entry points object
   *
   * required
   */
  entryPoints: EntryPoint[];
  /**
   * Array of hooks to handle bundled and compiled code
   *
   * default - []
   */
  postProcessHooks?: SuSee.PostProcessHook[];
  /**
   * Allow bundler to update your package.json.
   *
   * default - true
   */
  allowUpdatePackageJson?: boolean;
  /**
   * Your package run on NodeJs env or not
   *
   * default - true
   */
  nodeEnv?: boolean;
  renameDuplicates?: boolean;
}
```

## License

Apache-2.0
