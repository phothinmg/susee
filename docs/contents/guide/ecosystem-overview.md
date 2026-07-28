---
layout: docs
label: guide
title: Ecosystem Overview
---

The `@suseejs/*` ecosystem is split into focused packages so you can use only what your workflow needs.

## Package map

### Core build pipeline

- `@suseejs/bundler`
- `@suseejs/compiler`
- `@suseejs/graph`
- `@suseejs/files`
- `@suseejs/tsoptions`

### Plugin packages

- `@suseejs/banner-text-plugin`
- `@suseejs/terser-plugin`

### Foundation packages

- `@suseejs/type`
- `@suseejs/utilities`
- `@suseejs/color`

## How these pieces work together

A typical Susee build flow:

1. `@suseejs/graph` builds dependency information.
2. `@suseejs/bundler` merges and normalizes dependency and entry code.
3. `@suseejs/compiler` compiles bundled source into output formats.
4. `@suseejs/files` writes output artifacts and handles file operations.
5. `@suseejs/tsoptions` resolves compiler options from tsconfig/defaults.
6. Optional plugin packages transform code in plugin hooks.

## Which page to read next

- For pipeline internals: [Core Build Packages](/guide/ecosystem-core-build-packages)
- For installable plugins: [Plugin Packages](/guide/ecosystem-plugin-packages)
- For shared primitives and types: [Foundation Packages](/guide/ecosystem-foundation-packages)
- For contribution workflows across `susee` and `suseejs`: [Contribution Overview](/guide/contribution-overview)

## Quick install examples

Install a core package:

```sh
npm i @suseejs/bundler
```

Install plugin packages:

```sh
npm i @suseejs/banner-text-plugin @suseejs/terser-plugin
```

Install foundation packages:

```sh
npm i @suseejs/type @suseejs/utilities @suseejs/color
```
