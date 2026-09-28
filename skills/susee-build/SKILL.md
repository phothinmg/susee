---
name: susee-build
description: "Build, bundle, and lint TypeScript library packages with the susee bundler. Use when setting up susee.config files, running susee build/bundle/check/init CLI commands, using the programmatic build API, producing dual ESM+CJS library output, or updating package.json exports after a build."
---

# Susee Build

Susee is a TypeScript library bundler powered by `oxc`, specialized for library packages. It consolidates a package's local TypeScript dependency tree into consolidated source units and compiles them into dual-format artifacts (ESM and CommonJS) with declaration output.

This skill covers configuring and running susee builds. For diagnosing failed builds, see the `susee-troubleshooting` skill. For working on the susee codebase itself, see the `susee-contribution` skill.

## When to Use

- Creating or editing a `susee.config.{ts,js,mjs}` file
- Running `susee build`, `susee bundle`, `susee check`, or `susee init`
- Producing dual ESM/CJS library artifacts with types
- Calling the programmatic `build`/`suseeBundle` API from scripts
- Deciding whether susee fits a task: susee is for **library packages**, not application bundling

## Installation and Version Requirement

```sh
npm i -D susee
npx susee --version
```

- Use **susee v2.3.0 or above**. In v2.3.0 the core bundler was ported from TypeScript to Rust (powered by `oxc`), fixing multiple bugs present in earlier versions. Older versions are not recommended.
- CLI entry extensions accepted: `.js`, `.ts`, `.mts`, `.mjs`, `.cjs`, `.cts`, `.tsx`, `.jsx`.

## Step 1: Create the Config File

Run `npx susee init` for a starter config. It prompts whether the project uses TypeScript:

- **Yes** → writes `susee.config.ts`
- **No** → checks `package.json` `type` field: `"module"` writes `susee.config.js`, otherwise `susee.config.mjs`

If a config already exists it is overwritten.

Susee discovers config files in the current working directory in this priority order: `susee.config.ts`, `susee.config.js`, `susee.config.mjs`.

### Config Schema Reference

```ts
import type { SuSeeConfig } from "susee";

const config: SuSeeConfig = {
  entryPoints: [
    {
      entry: "src/index.ts",            // required — entry file path (relative to cwd)
      exportPath: ".",                  // required — "." for main export or "./sub"
      format: ["esm", "commonjs"],      // optional, default ["esm"], duplicates removed
      tsconfigFilePath: undefined,      // optional — custom tsconfig path
      checks: {                         // optional, all default false
        checkAnonymous: false,
        checkDefaultExports: false,
        checkNpmInstalled: false,
      },
      minify: false,                    // optional — false | true | { options: MinifyOptions }
    },
  ],
  outDir: "dist",                       // optional, default "dist"
  allowUpdatePackageJson: false,        // optional, default false
};

export default config;
```

Behavior details:

| Field | Behavior |
| ----- | -------- |
| `entry` | Must exist on disk (resolved from cwd) or the build exits with code 1 |
| `exportPath` | Must be unique across `entryPoints`; duplicates fail the build. `"."` outputs to `outDir`; `"./foo"` outputs to `outDir/foo` |
| `format` | `"esm"` and `"commonjs"` per entry; duplicates are removed during normalization |
| `tsconfigFilePath` | Priority order: this custom tsconfig → root `tsconfig.json` → susee's default compiler options |
| `checks` | Lint checks run against the bundled output; all default to `false` |
| `minify` | `true` for default minification, or `{ options: MinifyOptions }` for custom settings (runs the `oxc-minify` minifier over emitted JS) |
| `allowUpdatePackageJson` | When `true`, susee updates `package.json` `exports`, `main`, `module`, and `types` fields after build output is generated |

## Step 2: Run the Build

### Config-based build

```sh
npx susee build
```

Reads the config file, builds every entry point, and writes output to `outDir` (default `dist`).

### Single-entry build without a config

```sh
npx susee build src/index.ts --outdir dist --format esm
```

Full flag reference:

```text
--entry <path>                 Entry file (optional if given as positional <entry>)
--outdir <path>                Output directory (default: dist)
--format <cjs|commonjs|esm|both>  Output format (default: esm)
--tsconfig <path>              Custom tsconfig path
--allow-update[=true|false]     Allow package.json updates (default: false)
--minify[=true|false]          Minify output JS with the oxc minifier (default: false)
--check[=true|false]           Enable bundler lint checks (default: false)
```

Boolean flags accept `--flag=true|false`, `--flag true|false`, or a bare `--flag` (defaults to `true`). Any other boolean value fails the build.

Examples:

```sh
npx susee build src/index.ts --format commonjs
npx susee build --entry src/index.ts --format esm --tsconfig tsconfig.build.json
npx susee build src/index.ts --minify
npx susee build src/index.ts --check
```

### Bundle-only (no compilation)

```sh
npx susee bundle src/index.ts --outdir dist
```

Bundles the entry's local dependency tree into a single source string and writes it directly to the output directory **without** TypeScript compilation, declaration generation, or `package.json` updates. The output file keeps the entry's base name.

```text
--entry <path>          Entry file (optional if provided as positional <entry>)
--outdir <path>         Output directory (default: current working directory)
--check[=true|false]    Enable lint checks on the bundled output (default: false)
```

### Lint check (no output written)

```sh
npx susee check
```

Runs lint checks on every entry point defined in the config file without bundling or compiling. Enables all three checks (`checkAnonymous`, `checkDefaultExports`, `checkNpmInstalled`) and reports errors and warnings per entry.

### Help and version

- `susee --help` / `susee -h` — usage text
- `susee --version` / `susee -v` — current package version

## Step 3: Use the Programmatic API

The `susee` package exports `build` and `suseeBundle`, plus the `SuSeeConfig` and `CheckOptions` types:

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
  allowUpdatePackageJson: false,
});
```

The CLI is also importable from `"susee/cli"` for custom scripting.

## Output Expectations

- **Dual output** — both ESM and CommonJS artifacts from the same entry definition
- **Declaration output** — `.d.ts` files are emitted alongside JS
- **JSX support** — JSX in bundled output is detected and the JSX runtime validated (React or a configured `jsxImportSource`) before compiling
- **Duplicate declaration validation** — when source consolidation produces conflicting top-level declarations, the build **fails** with file and location info instead of silently renaming identifiers

## Verification Checklist

After a build, confirm:

1. Exit code `0` and artifacts exist under `outDir` (and `outDir/<subpath>` for non-`.` export paths)
2. ESM/CJS files match the configured `format` per entry
3. If `allowUpdatePackageJson` was enabled, `package.json` `exports`/`main`/`module`/`types` point at the new artifacts
4. If `--check` or `checks` were enabled, review reported warnings even on success