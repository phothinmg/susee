# susee: Tiny TypeScript Bundler

A minimal bundler for TypeScript projects that emits CommonJS, ESM, and type declarations in one pass. It streamlines package exports, supports custom post-process hooks (e.g., banner injection, minification), and auto-updates `package.json`.

## Overview

- Bundles a TypeScript entry with its dependency tree into a single output.
- Emits both CommonJS (`.cjs`) and ESM (`.mjs`) builds plus `.d.ts` files.
- Automatically writes or updates `main`, `module`, `types`, and `exports` in `package.json`.
- Supports synchronous and asynchronous post-process hooks for code transformation.

---

## 📦 Entry Point: src/index.ts

The **susee** namespace exposes the `build` function, orchestrating cleanup, bundling, compilation, hooks, and `package.json` updates.

### Key Components

- **PostProcessHook**

A union type defining sync or async hooks:

```ts
  export type PostProcessHook =
    | { async: true;  func: (code: string, file?: string) => Promise<string> }
    | { async: false; func: (code: string, file?: string) => string };
```

- **BuildOptions**

Configuration interface for `build()`:

```ts
  interface BuildOptions {
    entry: string;
    target?: Target;
    defaultExportName?: string;
    isMainExport?: boolean;
    outDir?: string;
    replaceWithBlank?: string[];
    hooks?: PostProcessHook[];
  }
```

- **build** function

Coordinates:

1. Clearing `outDir`.
2. Resolving entry path.
3. Bundling via `./bundle`.
4. Compiling to CommonJS/ESM via `Compilers`.
5. Awaiting delays to avoid race conditions.
6. Writing `package.json` updates.
7. Emitting a warning if both named and default exports exist.

### BuildOptions Reference

| Option | Type | Default | Description |  |  |
| --- | --- | --- | --- | --- | --- |
| `entry` | `string` | — | Path to the TypeScript entry file. |  |  |
| `target` | `"commonjs" \ | "esm" \ | "both"` | `"both"` | Output format(s) to generate. |
| `defaultExportName` | `string` | `undefined` | Identifier for default export in CommonJS. |  |  |
| `isMainExport` | `boolean` | `true` | Marks this build as the primary export versus a subpath. |  |  |
| `outDir` | `string` | `"dist"` | Directory for build artifacts. Subpaths require nested folders. |  |  |
| `replaceWithBlank` | `string[]` | `[]` | Identifiers to blank out in generated code. |  |  |
| `hooks` | `PostProcessHook[]` | `[]` | Array of functions applied after code compilation. |  |  |


```ts
await susee.build({
  entry: "src/index.ts",
  target: "both",
  defaultExportName: "myLib",
  outDir: "dist",
  hooks: [bannerText(license), minify()],
});
```

---

## 🧩 Utilities: src/helpers.ts

Helper functions for filesystem operations, path handling, and timing.

- **wait(time: number): Promise<void>**

Returns a promise that resolves after the given milliseconds.

- **writeOutFile(filePath: string, content: string)**

Ensures target directory exists, removes existing file, and writes new content.

- **readFile**, **resolvePath**

TypeScript host wrappers for reading files and resolving paths.

- **getEntryPath(entry: string): string**

Strips leading `./` or `../` segments from entry paths.

- **clearFolder(folderPath: string)**

Recursively deletes all contents of a directory.

```ts
async function clearFolder(folderPath: string) { /* … */ }
```

---

## 🔖 Types: src/types.ts

Central definitions of types used across the bundler.

- **OutPutHook**: Sync/async hook signature.
- **OutPutHookFunc**: Factory returning an `OutPutHook`.
- **OutFiles**: Tracks output file paths for CommonJS, ESM, and types.
- **Target**: Union of `"commonjs"`, `"esm"`, or `"both"`.
- **Exports**: Shape of the `exports` field in `package.json`.

```ts
export type { OutPutHook, OutPutHookFunc, OutFiles, Target, Exports };
```

---

## 🔗 Bundling Engine: src/bundle.ts

Transforms an entry file and its dependencies into one concatenated code string.

### Workflow

1. **Graph Construction**

Uses `dependensia` to crawl and sort dependencies.

1. **AST Transformation**

Visits each file’s AST, removing `import`/`export` nodes and collecting them.

1. **Import Consolidation**

Merges collected import statements via `mergeImports`.

1. **Assembly**

Joins imports with transformed file contents into final code.

1. **Flagging**

Detects if both named and default exports exist (`dexport` flag).

```ts
async function bundle(entry: string, isESM = false): Promise<{ code: string; dexport: boolean }> { /* … */ }
```

---

## 🔄 Import Consolidation: src/mergeImports.ts

Processes arrays of import statements into minimal, merged imports.

- Combines **named**, **default**, **type-only**, and **namespace** imports.
- Eliminates duplicates and sorts statements.

```ts
function mergeImports(imports: string[]): string[] { /* … */ }
export default mergeImports;
```

---

## 🛠️ Compilers: src/compilers.ts

Wraps the TypeScript Compiler API to emit CommonJS and ESM outputs, applying hooks.

- **Constructor**

Initializes with optional `target` and empty `files` tracking.

- **commonjs(...)**

Compiles to `.cjs`, produces type declarations, applies `replaceWithBlank`, and hooks.

- **esm(...)**

Compiles to `.mjs`, produces `.d.mts`, and runs hooks.

- Populates the `files` property with paths for `main`, `module`, `types`, and their require/import variants.

```ts
class Compilers {
  async commonjs(sourceCode: string, fileName: string, outDir: string, /* … */) { /* … */ }
  async esm(sourceCode: string, fileName: string, outDir: string, /* … */) { /* … */ }
}
```

---

## 📦 Package Updater: src/package.ts

Updates the root `package.json` based on generated outputs.

1. Reads existing `package.json`.
2. Sets `type` to `"module"` if ESM output exists, else `"commonjs"`.
3. Constructs `main`, `module`, `types`, and `exports` via `getExports()`.
4. Writes the normalized JSON back to disk.

```ts
async function writePackage(files: OutFiles, isMain = true, outDir?: string): Promise<void> { /* … */ }
```

---

## 🎀 Banner Hook: src/banner-text/index.ts

Generates a **sync** post-process hook to prepend a custom banner to `.js` files.

```ts
const bannerText = (str: string): OutPutHook => ({
  async: false,
  func: (code, file) => {
    if (path.extname(file!) === ".js") {
      return `${str}\n${code}`;
    }
    return code;
  },
});
export default bannerText;
```

---

## 🚀 Minify Hook: src/minify/index.ts

Provides an **async** post-process hook using **Terser** to minify `.js` outputs.

```ts
const minify = (options?: MinifyOptions): OutPutHook => ({
  async: true,
  func: async (code, file) => {
    if (path.extname(file!) === ".js") {
      return (await minify2(code, options)).code!;
    }
    return code;
  },
});
export default minify;
```

---

## 🏗️ Build Script: build.ts

A standalone Node.js script that demonstrates building:

1. The **susee** core library with banner and minify hooks.
2. The **banner-text** submodule for distribution.
3. The **minify** submodule for standalone use.

```ts
await susee.build({
  entry: mainEntry,
  outDir: mainOutdir,
  defaultExportName: "susee",
  hooks: [bannerText(licenseText), minify()],
});
```

---

## ✅ Tests: tests/susee.build.test.ts

Covers critical `susee.build()` behaviors:

- Emits both CJS and ESM with type declarations.
- Respects `commonjs`-only target.
- Applies sync/async post-process hooks.
- Adds subpath exports when `isMainExport` is `false`.

---

## 📜 Configuration

### package.json

Defines project metadata, dependencies, and the export map:

```json
"scripts": {
  "build": "tsx build.ts",
  "test":  "tsx --test",
  "fmt":   "biome format --write",
  "lint":  "biome check src --write",
  "prepare":"husky"
},
"exports": {
  ".":          { "import": {"default":"./dist/index.mjs","types":"./dist/index.d.mts"}, "require":{"default":"./dist/index.cjs","types":"./dist/index.d.cts"} },
  "./banner-text": { /* … */ },
  "./minify":      { /* … */ }
}
```

### biome.json

Configures **Biome** for formatting and linting:

- Enables Git integration and respects `.gitignore`.
- Includes all files except `dist`.
- Enforces double quotes for JavaScript.

---

This documentation covers every source file, helper, hook, build script, test suite, and configuration in the repository. It provides a comprehensive guide for using, extending, and contributing to the **susee** TypeScript bundler.