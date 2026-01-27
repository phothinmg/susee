# Compilers Class (`src/compilers.ts`)

The `Compilers` class orchestrates compiling TypeScript source code into both CommonJS and ESM bundles, along with type declarations. It uses the TypeScript Compiler API to emit `.js`/`.d.ts` files, post-processes them (e.g., swapping export syntax), renames extensions (`.js → .cjs`/`.mjs`, `.d.ts → .d.cts`/`.d.mts`), writes them to disk, and records their paths for package manifest updates .

---

## Dependencies

- **`node:path`**: File extension and path utilities.  
- **`typescript`**: Compiler API for programmatic transpilation.  
- **Helpers**:  
  - `wait(time: number): Promise<void>` – simple delay.  
  - `writeOutFile(filePath: string, content: string)` – ensures directory existence, deletes old files, writes new content .  
- **Types** (from `src/types.ts`):  
  - `OutFiles` – struct storing output paths.  
  - `OutPutHook` – sync/async post-processing hook interface.  
  - `Target` – `"commonjs" | "esm" | "both"` .

---

## Class Structure

### Properties

- **`files: OutFiles`**  
  Tracks generated paths:  
  ```ts
  {
    commonjs, commonjsTypes,
    esm,      esmTypes,
    main,     module,
    types
  }
  ```
- **`private _target: Target`**  
  Determines which outputs to treat as the “main” package entry points.

### Constructor

```ts
constructor(target?: Target) {
  this._target = target ?? "both";
  this.files   = {
    commonjs:       undefined,
    commonjsTypes:  undefined,
    esm:            undefined,
    esmTypes:       undefined,
    main:           undefined,
    module:         undefined,
    types:          undefined,
  };
}
```
Initializes the build target (default `"both"`) and an empty `files` record .

---

## Methods

### commonjs(sourceCode, fileName, outDir, isMain, defaultExportName, replaceWithBlank, hooks) 🐢

Compiles to CommonJS, applies export adjustments, hooks, renames, and writes files.

- **Parameters**  
  - `sourceCode: string` – TS code.  
  - `fileName: string` – pseudo-path for the compiler host.  
  - `outDir: string` – directory for output.  
  - `isMain: boolean` – assign to `files.main`/`files.types` if true.  
  - `defaultExportName?: string` – identifier for `export default`.  
  - `replaceWithBlank?: string[]` – substrings to strip from output.  
  - `hooks?: OutPutHook[]` – post-process transforms.

- **Flow**  
  1. Configure TS options (`module: CommonJS`, `declaration: true`, etc.).  
  2. Create a custom `ts.CompilerHost` to feed source and capture outputs.  
  3. `program.emit()` to populate `createdFiles`.  
  4. For each output:  
     - If `.js`, replace `exports.default = X;` with `module.exports = X;`.  
     - If `.d.ts`, replace `export default X;` with `export = X;`.  
     - Remove any `replaceWithBlank` strings.  
     - Invoke each hook (await if `async`).  
     - Update `this.files.commonjs`/`commonjsTypes`.  
     - On main-target builds, propagate to `this.files.main`/`types`.  
     - Rename extensions (`.js→.cjs`, `.map.js→.map.cjs`, `.d.ts→.d.cts`).  
     - Delay via `wait(500)`, then `writeOutFile` .  

- **Timing**  
  Wrapped in `console.time("Compiled Commonjs")`/`console.timeEnd`.

### esm(sourceCode, fileName, outDir, isMain, hooks) 🚀

Analogous to `commonjs`, but targeting ES modules:

- **TS Options**: `module: ES2020`, `declaration: true`, etc.  
- **Post-emit**:  
  - Rename `.js→.mjs`, `.map.js→.map.mjs`, `.d.ts→.d.mts`.  
  - Update `this.files.esm`/`esmTypes`.  
  - On `"both"` targets, set `this.files.module`.  
  - Write files after `wait(500)` .  
- **Timing**  
  Wrapped in `console.time("Compiled ESM")`/`console.timeEnd`.

---

## Output Mapping

| Original Ext | CJS Final | ESM Final | `OutFiles` Key    |
|--------------|-----------|-----------|-------------------|
| `.js`        | `.cjs`    | `.mjs`    | `commonjs`/`esm`  |
| `.map.js`    | `.map.cjs`| `.map.mjs`| —                 |
| `.d.ts`      | `.d.cts`  | `.d.mts`  | `commonjsTypes`/`esmTypes` |
| **Main**     | `main`    | `types`   | `files.main`/`files.types` |
| **Module**   | —         | `module`  | `files.module`    |

---

## Integration & Usage

`Compilers` is driven by the high-level `susee.build` in `src/index.ts`. After bundling with the `bundle()` helper, `build()` does:

```ts
const compiler = new Compilers(target);
if (target === "commonjs" || target === "both") {
  await compiler.commonjs(bundled.code, entry, outDir, isMain, defaultExportName, replaceWithBlank, hooks);
}
if (target === "esm" || target === "both") {
  await compiler.esm(bundled.code, entry, outDir, isMain, hooks);
}
```
Then `build()` writes `package.json` based on `compiler.files` .

---

## Design Highlights

- **Single-Class, Multi-Target**  
  One class handles both CJS and ESM, reducing duplication.
- **TypeScript Compiler API**  
  Direct use of `ts.createProgram` and `ts.CompilerHost` for maximum control.
- **Hookable Post-Processing**  
  Supports synchronous and asynchronous code transforms (banner injection, minification).
- **Explicit File Management**  
  Delayed writes and manual deletion ensure clean, predictable artifacts.
- **Output Tracking**  
  `files: OutFiles` centralizes exported file paths for downstream packaging.

This design strikes a balance between simplicity and extensibility, enabling fine-grained control over multi-format builds.