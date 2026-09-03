---
layout: docs
label: guide
title: Contributing to Core Build Packages
---

This page is for contributions to Susee's core build internals in this repository.

## Target modules

The main build stages are implemented in TypeScript under `src/`:

- `src/build.ts` — build orchestration
- `src/bundler.ts` — bundling wrapper (delegates to `@suseejs/susee_bundler`)
- `src/compiler/index.ts` — compiler class that drives compilation per format
- `src/compiler/suseeCompiler.ts` — in-memory TypeScript compilation host
- `src/compiler/tsoptions.ts` — tsconfig resolution and compiler option generation
- `src/config/index.ts` — config loading, validation, and build option generation
- `src/cli/index.ts` — CLI entry point and dispatch
- `src/cli/parse_args.ts` — CLI argument parsing
- `src/cli/init.ts` — config file scaffolding
- `src/cli/print_help.ts` — help text
- `src/helpers/files.ts` — file system operations and package.json updates
- `src/helpers/minify.ts` — oxc-minify wrapper

The package's main entry point is `src/index.ts`, which re-exports `build` and `SuSeeConfig`.

## 1. Work in this repository

Install dependencies:

```sh
npm install
```

If the repository has a hooks installation script, run:

```sh
npm run hooks:install
```

Build the project:

```sh
npm run build
```

Run linting and formatting:

```sh
npm run lint
npm run fmt
```

## 2. Pick the owning module first

Before coding, choose exactly where the fix belongs:

- Build orchestration: `src/build.ts`
- Bundling logic: `src/bundler.ts` (or the `@suseejs/susee_bundler` package)
- Compiler behavior: `src/compiler/suseeCompiler.ts`
- Compiler option resolution: `src/compiler/tsoptions.ts`
- Config parsing/validation: `src/config/index.ts`
- CLI dispatch: `src/cli/index.ts`
- CLI argument parsing: `src/cli/parse_args.ts`
- Config file scaffolding: `src/cli/init.ts`
- File system/output handling: `src/helpers/files.ts`
- Minification: `src/helpers/minify.ts`

## 3. Implement and test in-module

Recommended flow:

1. Make changes in one module slice first.
2. Run the build to validate: `npm run build`.
3. Run lint to check for issues: `npm run lint`.

## 4. Keep public behavior in mind

These internals power the public `susee` CLI and programmatic API, so for behavior changes:

- document the change in package README/changelog if needed
- verify CLI, config, or build integration behavior still matches expectations
- avoid silent breaking changes

## 5. Commit and open PR

```sh
# run this command in terminal
npm run commit
```

```sh
1) ⭐ feat          3) 🎨 modified      5) 👕 refactor      7) 📦 add(package)  9) ✅ tests
2) 🐛 bug           4) 🔒 security      6) ⚠️ deprecated     8) 🚀 release
Select a number for commit type: # select number what your change
Enter commit message: # enter your commit message

# that will commit to your current branch
```

Then open a pull request in:

- <https://github.com/phothinmg/susee>

## Related pages

- [Contribution Overview](/guide/contribution-overview)
- [Core Build Packages](/guide/ecosystem-core-build-packages)
- [Pull Request Checklist](/guide/contribution-pr-checklist)
