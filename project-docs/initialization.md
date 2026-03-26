<!-- markdownlint-disable MD041 -->

## Initialization Phase

The initialization phase collects and validates all inputs required for next steps.

### Get Susee configuration

#### Info

- File : `src/lib/suseeConfig.ts`
- Function : `finalSuseeConfig`,`getConfigPath`,`checkEntries`
- Type : `FinalSuseeConfig`

#### Error handling

Checks for the following conditions. If none of these conditions are met, the process will exit with code 1:

1. **Config file exists**: Searches for `susee.config.{ts,js,mjs}` in project root -> Function : `getConfigPath`
2. **Non-empty entry points**: `config.entryPoints` array must contain at least one entry -> Function : `checkEntries`
3. **No duplicate exports**: Each exportPath must be unique across all entry points -> Function : `checkEntries`
4. **Entry files exist**: All entry file paths must resolve to actual files -> Function : `checkEntries`

#### Merge Susee config

It is done by the function `finalSuseeConfig` and returns a merged Susee configuration object.

### Dependency Graph Generation

<!-- markdownlint-disable MD024 -->

#### Info

- File : `src/lib/dependencies.ts`
- Function : `generateDependencies`
- Type : `DependenciesFiles`

#### Generate dependencies

A dependency analysis engine `mhaehko`(from susee's ecosystem) that traverses TypeScript and JavaScript codebases to produce comprehensive dependency graphs. It uses the TypeScript compiler API to parse source files and extract import/require relationships, then applies graph algorithms to detect patterns and generate actionable insights.

<!-- markdownlint-disable MD052 -->

The `Mhaehko` interface provides 12 useful methods [[see here][mhaekho]], but currently only `Mhaehko.sort()` (which performs a topological sort of dependencies) is used. Additional methods can be integrated in the future as needed. The `generateDependencies` function returns an array of dependency file objects, which can be used in the subsequent bundling process or as hooks for plugins (type="dependency").

### TypeScript Compiler Options Setup

#### Info

- File : `src/lib/compilerOptions.ts`
- Function : `compilerOptions`
- Type : `CompilerOptions`

#### Collect Compiler Options

TypeScript compiler options are set up in the following order, except for `outDir`, `rootDir`, `module`, and `moduleResolution`:

1. If a custom `tsconfig.json` path is specified for an `entryPoint` in `susee.config.{ts,js,mjs}`, that file is used. Users can define a different `tsconfig.json` for each entry point.
2. If no custom path is provided, `susee` uses the `tsconfig.json` in the project root directory.
3. If neither of the above is found, `susee` falls back to its default compiler options.

The `compilerOptions` function returns an instance of `CompilerOptions`. It supports `esm` for ES module compiling, `commonjs` for CommonJS compiling, and `default` for bundling or transform hooks.

<!-- markdownlint-disable MD053 -->

[mhaekho]: https://github.com/phothinmg/mhaehko/blob/main/README.md
