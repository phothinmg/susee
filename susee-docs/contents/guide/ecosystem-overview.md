---
layout: docs
label: guide
title: Ecosystem Overview
---

The current Susee ecosystem mixes public packages with internal build modules.

## Package map

### Core build pipeline in this repository

- `src/bundler`
- `src/compiler`
- `src/dependencies`
- `src/helpers/files.ts`
- `src/compiler/tsoptions.ts`

### Plugin packages

- `@suseejs/banner-text-plugin`
- `@suseejs/terser-plugin`

### Foundation packages

- `@suseejs/type`
- `@suseejs/utilities`
- `@suseejs/color`

## How these pieces work together

A typical Susee build flow:

1. `src/dependencies/graph.ts` builds dependency information.
2. `src/bundler` merges and normalizes dependency and entry code.
3. `src/compiler` compiles bundled source into output formats.
4. `src/helpers/files.ts` writes output artifacts and handles file operations.
5. `src/compiler/tsoptions.ts` resolves compiler options from tsconfig/defaults.
6. Optional plugin packages transform code in plugin hooks.

## Which page to read next

- For pipeline internals: [Core Build Packages](/guide/ecosystem-core-build-packages)
- For installable plugins: [Plugin Packages](/guide/ecosystem-plugin-packages)
- For shared primitives and types: [Foundation Packages](/guide/ecosystem-foundation-packages)
- For contribution workflows across public APIs and internal build modules: [Contribution Overview](/guide/contribution-overview)

## Install examples

Install the top-level tool:

```sh
npm i -D susee
```

Install plugin packages:

```sh
npm i @suseejs/banner-text-plugin @suseejs/terser-plugin
```

Install foundation packages:

```sh
npm i @suseejs/type @suseejs/utilities @suseejs/color
```
