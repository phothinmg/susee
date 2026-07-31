---
layout: docs
label: guide
title: Contributing to Core Build Packages
---

This page is for contributions to Susee's core build internals in this repository.

## Target modules

The main build stages now live under `src/` as internal modules:

- `src/bundler`
- `src/compiler`
- `src/dependencies`
- `src/helpers/files.ts`
- `src/compiler/tsoptions.ts`

## 1. Work in this repository

Use npm for consistency with this repository's lockfile and npm-based scripts.

```sh
npm install
```

If the repository has a hooks installation script, run:

```sh
npm run hooks:install
```

## 2. Pick the owning module first

Before coding, choose exactly where the fix belongs:

- API surface or transforms in bundling: `src/bundler`
- compiler behavior: `src/compiler`
- dependency graph logic: `src/dependencies`
- filesystem/output handling or `package.json` updates: `src/helpers/files.ts`
- TypeScript options resolution: `src/compiler/tsoptions.ts`

## 3. Implement and test in-module

Recommended flow:

1. Make changes in one module slice first.
2. Run the narrowest local test or validation that covers that slice.
3. Validate adjacent build stages if your change affects shared contracts.

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
