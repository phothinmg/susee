<details>
<summary>Documentation Metadata (click to expand)</summary>

```json
{
  "doc_type": "file_overview",
  "file_path": "src/lib/compiler.ts",
  "source_hash": "dca110f1d1976d8c6ad85c52333fc37cd63063ca62a0435b8ffbe301d7685801",
  "last_updated": "2026-04-22T22:32:46.593990+00:00",
  "tokens_used": 8257,
  "complexity_score": 4,
  "estimated_review_time_minutes": 10,
  "external_dependencies": [
    "@suseejs/bundler",
    "@suseejs/compiler",
    "@suseejs/files",
    "@suseejs/tsoptions"
  ]
}
```

</details>

[Documentation Home](../../README.md) > [src](../README.md) > [lib](./README.md) > **compiler**

---

# compiler.ts

> **File:** `src/lib/compiler.ts`

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

This file defines a Compiler class that orchestrates a build pipeline for each BuildEntryPoint in provided BuildOptions. For each entry point and requested format it runs a bundler to produce a single source bundle, compiles that bundle with suseeCompiler using format-specific TypeScript options, and collects compiled outputs (code, maps, and d.ts).

After compilation the class can run optional post-process plugins (sync or async) to modify output, adjust source-map URLs for .cjs/.mjs naming, write files to disk, and, when enabled, update package.json exports using an internal OutFiles record.

## Dependencies

### External Dependencies

| Module | Usage |
| --- | --- |
| `@suseejs/bundler` | Imports the named function bundler and calls it as: await bundler(point.entry, point.plugins, point.warning, point.rename) to produce a single bundled source string for each build entry point before compilation. |
| `@suseejs/compiler` | Imports the named function suseeCompiler and invokes it with an object { sourceCode: bundledCode, fileName: point.entry, compilerOptions } to produce compiled.output fields (code, map, dts, file_name, out_dir) used for file naming and contents. |
| `@suseejs/files` | Imports the files namespace and uses its types and functions: files.OutFiles (type for this._files), files.joinPath(...) to construct output paths, files.writeFile(...) to write compiled code/dts/maps, files.writePackageJson(this._files, point.exportPath) to update package.json entries, and files.clearFolder(this._object.outDir) to remove previous build outputs. |
| `@suseejs/tsoptions` | Imports getCompilerOptions and calls getCompilerOptions(point.tsconfigFilePath) to obtain an object with format-specific helpers (opts.commonjs(...) and opts.esm(...)) that produce compilerOptions passed to suseeCompiler. |

### Internal Dependencies

| Module | Usage |
| --- | --- |
| [./suseeConfig.js](.././suseeConfig.js.md) | Imports TypeScript types BuildEntryPoint and BuildOptions (import type { BuildEntryPoint, BuildOptions } from "./suseeConfig.js") which are used as parameter and property types: constructor(object: BuildOptions), private _commonjs(point: BuildEntryPoint), private _esm(point: BuildEntryPoint), and compile() iterates this._object.buildEntryPoints. |

## 📁 Directory

This file is part of the **lib** directory. View the [directory index](_docs/src/lib/README.md) to see all files in this module.

## Architecture Notes

- Encapsulates the build pipeline inside a single Compiler class: private helpers _commonjs and _esm implement format-specific steps while shared orchestration is in compile().
- Maintains internal files.OutFiles state (this._files) to collect produced main/module and types paths and conditionally writes package.json exports when BuildOptions.updatePackage is true.
- Plugin system supports both function-valued plugins (invoked to obtain an object) and plugin objects, and recognizes 'post-process' plugins that can be synchronous or asynchronous to modify compiled code before writing.

## Usage Examples

### Main use case

Instantiate new Compiler(buildOptions) with a BuildOptions object (containing outDir, buildEntryPoints, updatePackage, etc.) and call await compiler.compile(); this clears outDir, bundles and compiles each entry point for each requested format (.cjs/.mjs), writes the compiled code, declaration files and maps, and (if updatePackage is true) updates package.json exports using files.writePackageJson.

## Maintenance Notes

- Source-map URL replacement uses a RegExp replacing `${compiled.file_name}.js.map` with `.cjs.map` or `.mjs.map`; ensure compiled.file_name does not contain characters that break the regex.
- Post-process plugins may be functions (called to get the plugin object) or plugin objects; plugin.func may be async or sync and is awaited accordingly—ensure plugins follow the expected shape ({ type: 'post-process', func, async }).
- File names for type outputs use `.d.cts` for CommonJS and `.d.mts` for ESM; if TypeScript emitter changes, update filename logic accordingly.

---

## Navigation

**↑ Parent Directory:** [Go up](_docs/src/lib/README.md)

---

*This documentation was automatically generated by AI ([Woden DocBot](https://github.com/marketplace/ai-document-creator)) and may contain errors. It is the responsibility of the user to validate the accuracy and completeness of this documentation.*
