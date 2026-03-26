# Getting Started

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
