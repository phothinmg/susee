# src/package.ts

This module automates updating the project’s **package.json** with new build outputs. It reads the existing package manifest, injects or merges fields for entry points (`main`, `module`, `types`) and the [`exports`](https://nodejs.org/api/packages.html#exports) map, then writes back the updated JSON. It supports both the **main export** and **subpath exports**, adapting fields accordingly. 

---

## ⚙️ Helpers

- **isCjs(files: OutFiles): boolean**  
  Returns `true` if CommonJS output (`.cjs`) and its types (`.cts`) exist.

- **isEsm(files: OutFiles): boolean**  
  Returns `true` if ESM output (`.mjs`) and its types (`.mts`) exist. 

---

## 📦 getExports(files, isMain?, outDir?): Exports

Computes the [`exports`](https://nodejs.org/api/packages.html#exports) object for **package.json** based on available outputs.

```ts
function getExports(
  files: OutFiles,
  isMain = true,
  outDir?: string
): Exports
```

- **files**: build result paths (`commonjs`, `commonjsTypes`, `esm`, `esmTypes`)  
- **isMain**: `true` for root export, `false` for subpath  
- **outDir**: path for subpath export (e.g. `"dist/foo"`)

If `!isMain`, `outDir` must contain at least one segment (e.g. `"foo/bar"`). Otherwise it throws. 

### Export Cases

| Condition            | Export Key  | Content                                                                          |
|----------------------|-------------|----------------------------------------------------------------------------------|
| CJS + ESM            | `.` or sub  | Both `import` & `require`, each with `default` & `types` fields                  |
| CJS only             | `.` or sub  | Only `require` + `types`                                                         |
| ESM only             | `.` or sub  | Only `import` + `types`                                                          |
| Neither              | —           | `{}` (no exports)                                                                |

---

## 📝 writePackage(files, isMain?, outDir?): Promise<void>

Reads, updates, and writes **package.json** to reflect the latest build outputs.

```ts
async function writePackage(
  files: OutFiles,
  isMain = true,
  outDir?: string
): Promise<void>
```

| Parameter | Description                                                                                       |
|-----------|---------------------------------------------------------------------------------------------------|
| **files** | Paths returned by the compiler (see `OutFiles` in `src/types.ts`).                                 |
| **isMain**| Whether updating the root export (`true`) or adding a subpath (`false`).                          |
| **outDir**| Output directory for subpath exports (e.g. `"dist/utils"`). Required if `isMain` is `false`.      |

### Workflow

1. **Read** existing `package.json` in `process.cwd()`  
2. **Defer** briefly (`wait(500)`) to allow file locks to settle  
3. If **main export**, set `type` to `"module"` if ESM outputs exist, else `"commonjs"`.  
4. Build partial objects:
   - `_main`: `{ main: files.main }`
   - `_module`: `{ module: files.module }`
   - `_types`: `{ types: files.types }`
   - `_exports`:  
     - For **main**, `exports: getExports(...)`  
     - For **subpath**, merge existing exports with new subpath entry  
5. **Defer** again (`wait(1000)`) before writing  
6. **Write** updated JSON (2-space indent) and log timing 

### Example Usage

```ts
import writePackage from "./package";
await writePackage(compiler.files, true, /* outDir ignored for main */);
```

In the build pipeline (`src/index.ts`), it is invoked after compilation:

```ts
await writePackage(compiler.files, isMainExport, outDir);
``` 

---

## 🔗 Integration & Context

- **Types**  
  - `OutFiles` tracks output filenames (`commonjs`, `esm`, etc.)  
  - `Exports` defines the shape of the `exports` field in **package.json** (import vs. require signatures)  

- **Build Pipeline**  
  In `src/index.ts`, after bundling and compiling (via `bundle` and `Compilers`), `writePackage` finalizes package metadata.

- **Subpath Exports**  
  When packaging additional entries (e.g. `banner-text`, `minify`), set `isMainExport: false` and specify `outDir` to register `./subpath` exports automatically.  

---

✨ With this module, **susee** maintains a consistent, Node-friendly package manifest that aligns with each build variant (CJS, ESM, type declarations).