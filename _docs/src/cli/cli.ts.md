<details>
<summary>Documentation Metadata (click to expand)</summary>

```json
{
  "doc_type": "file_overview",
  "file_path": "src/cli/cli.ts",
  "source_hash": "556ac9f4faf87e17074d3d984495b04b5c284185bc4ae2d53af7db813385a77f",
  "last_updated": "2026-04-22T22:29:52.587194+00:00",
  "tokens_used": 8806,
  "complexity_score": 4,
  "estimated_review_time_minutes": 10,
  "external_dependencies": [
    "@suseejs/bundler",
    "@suseejs/compiler",
    "@suseejs/files",
    "@suseejs/terser-plugin",
    "@suseejs/tsoptions"
  ]
}
```

</details>

[Documentation Home](../../README.md) > [src](../README.md) > [cli](./README.md) > **cli**

---

# cli.ts

> **File:** `src/cli/cli.ts`

![Complexity: Medium](https://img.shields.io/badge/Complexity-Medium-yellow) ![Review Time: 10min](https://img.shields.io/badge/Review_Time-10min-blue)

## 📑 Table of Contents


- [Overview](#overview)
- [Dependencies](#dependencies)
- [Architecture Notes](#architecture-notes)
- [Usage Examples](#usage-examples)
- [Maintenance Notes](#maintenance-notes)
- [Functions and Classes](#functions-and-classes)

---

## Overview

This file defines a CliCompiler class that orchestrates end-to-end builds for a single entry point. It bundles source with the bundler, invokes suseeCompiler with format-specific TypeScript options (CommonJS or ESM), optionally injects the suseeTerser minifier, runs post-process plugins, normalizes source-map references, and writes JS, declaration and map files to the configured outDir.

The async compile(opts) method clears the output directory and delegates to private _commonjs or _esm flows depending on opts.format. When opts.allowUpdate is true it records produced artifact paths in an internal files.OutFiles structure and calls files.writePackageJson to update package.json. The module exports a singleton cliCompiler for programmatic use.

## Dependencies

### External Dependencies

| Module | Usage |
| --- | --- |
| `@suseejs/bundler` | Imports the bundler function (import { bundler } from "@suseejs/bundler"). Used to produce bundledCode via await bundler(opts.entry, opts.plugins, opts.warning, opts.rename) before compilation. |
| `@suseejs/compiler` | Imports the suseeCompiler function (import { suseeCompiler } from "@suseejs/compiler"). Used to compile bundled source into JavaScript, declaration content and source maps by calling suseeCompiler({ sourceCode: bundledCode, fileName: opts.entry, compilerOptions }). The returned object (compiled) is inspected for .code, .dts, .map, .out_dir, and .file_name. |
| `@suseejs/files` | Imports the files object (import { files } from "@suseejs/files"). Used extensively: files.OutFiles type for the _files property, files.joinPath to build output paths, files.writeFile to persist main/dts/map files, files.clearFolder(opts.outDir) to wipe the output directory before building, and files.writePackageJson(this._files, ".") to update package.json when allowUpdate is enabled. |
| `@suseejs/terser-plugin` | Imports the suseeTerser plugin (import { suseeTerser } from "@suseejs/terser-plugin"). When opts.minify is true the code prepends suseeTerser to opts.plugins and deduplicates the plugin list so minification is applied during the post-process/plugin phase. |
| `@suseejs/tsoptions` | Imports getCompilerOptions (import { getCompilerOptions } from "@suseejs/tsoptions"). Called with opts.tsconfig to obtain compilerOption builders; .commonjs(opts.outDir) or .esm(opts.outDir) are used to derive the compilerOptions passed to suseeCompiler. |

### Internal Dependencies

| Module | Usage |
| --- | --- |
| [./lib/parse_argv.js](.././lib/parse_argv.js.md) | Imports the CliBuildOptions type (import type { CliBuildOptions } from "./lib/parse_argv.js"). Used as the TypeScript type annotation for method parameters: _commonjs(opts: CliBuildOptions), _esm(opts: CliBuildOptions), and compile(opts: CliBuildOptions). This is a local/internal module (type-only import). |

## 📁 Directory

This file is part of the **cli** directory. View the [directory index](_docs/src/cli/README.md) to see all files in this module.

## Architecture Notes

- Single-class orchestration: CliCompiler centralizes build flow and exposes a single async compile(opts) entry point while delegating format-specific steps to private methods _commonjs and _esm.
- Plugin post-processing: Plugins can be functions or plugin objects; the code normalizes and executes plugins of type 'post-process' and supports both sync and async plugin functions.
- Conditional package.json update: The class records produced artifact paths into an internal files.OutFiles structure and only calls files.writePackageJson(this._files, '.') when opts.allowUpdate is true.

## Usage Examples

### Programmatic build invocation

Import the exported singleton cliCompiler and call await cliCompiler.compile(opts) where opts conforms to CliBuildOptions (includes entry, outDir, format, plugins, minify, tsconfig, allowUpdate). The method clears outDir, compiles either CommonJS or ESM output, writes JS/d.ts/map files, and if allowUpdate=true updates package.json in the current directory.

## Maintenance Notes

- Minify handling mutates opts.plugins by prepending suseeTerser and deduplicating via Set; callers should be aware opts.plugins may be changed.
- Source map path replacement is a simple string replace of `${file_name}.js.map` → `.cjs.map` or `.mjs.map`; ensure compiled.file_name matches expectations to avoid incorrect map links.
- Declaration filenames differ per format (.d.cts for CommonJS, .d.mts for ESM); tests or downstream tooling must expect these exact names.

---

## Navigation

**↑ Parent Directory:** [Go up](_docs/src/cli/README.md)

---

*This documentation was automatically generated by AI ([Woden DocBot](https://github.com/marketplace/ai-document-creator)) and may contain errors. It is the responsibility of the user to validate the accuracy and completeness of this documentation.*
