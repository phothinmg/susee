---
layout: docs
label: guide
title: Build Hooks and Lifecycle
---

This page documents the internal build hooks that run at different stages of the susee pipeline and the order in which they execute.

> **Note**: The current Rust/native (napi-rs) implementation of susee does **not** expose a user-configurable plugin API. The `EntryPoint` config struct has no `plugins` field. The hooks described below are built-in stages implemented in `src/core/susee_hooks/`. They run automatically as part of the bundling and compilation pipeline and cannot be registered or customized from configuration.

## Hook categories

Susee groups its internal hooks into three stages, mirroring the lifecycle of the original TypeScript implementation.

### 1) Tree hooks (during bundling)

Run inside `run_tree_hooks` (`src/core/susee_hooks/mod.rs`) over the dependency file list, before the merged source string is produced.

| Hook              | Source file                              | Purpose                                                       |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `export_default`  | `tree_hooks/export_default.rs`           | Renames named default exports (`export default function foo`) |
| `anonymous`       | `tree_hooks/anonymous.rs`               | Names anonymous default exports/imports                       |
| `duplicates`      | `tree_hooks/duplicates.rs`               | Detects and renames cross-file duplicate top-level declarations |
| `remove`          | `tree_hooks/remove.rs`                   | Strips import/export statements; collects removed imports for re-emission |

Execution order matters: `export_default` runs **before** `anonymous` so that already-named default exports are not re-renamed, matching the TS implementation.

### 2) Pre-process hook (after merge, before compile)

Runs after the dependency and entry content have been merged into a single source string, but before TypeScript compilation to `.mjs`/`.cjs`.

| Hook          | Source file                       | Purpose                                          |
| ------------- | --------------------------------- | ------------------------------------------------ |
| `unused_code` | `pre_process_hooks/unused_code.rs`| Removes unused imports/code from the merged source |

### 3) Post-process hook (after compile, before write)

Runs after `susee_compiler` emits the output code, before files are written to disk.

| Hook       | Source file                | Purpose                                                          |
| ---------- | -------------------------- | ---------------------------------------------------------------- |
| `minify_js`| `post_process_hooks/minify.rs` | Re-parses the emitted JS and runs the oxc minifier (compression + mangling). Gated by the `minify` config flag. Falls back to the unminified source on parse failure. |

## Lifecycle order

For each entry point and each requested `OutputFormat` (`esm` and/or `commonjs`), susee runs this high-level flow:

1. Resolve compiler options (`tsconfigFilePath` → root `tsconfig.json` → internal defaults)
2. Run the bundler (`src/core/susee_bundler/mod.rs`)
   - Build the dependency tree (`susee_tree`)
   - Run the tree hooks (`export_default` → `anonymous` → `duplicates` → `remove`)
   - Merge dependency content and re-emit removed non-local imports at the top
   - Run the `unused_code` pre-process hook
   - Pretty-print the bundled source through oxc's codegen
3. Compile the bundled source with `susee_compiler` (emit JS + declarations + source map)
4. Rename the sourcemap reference (`.js.map` → `.mjs.map` / `.cjs.map`)
5. Run the `minify_js` post-process hook (only when `minify: true`)
6. Write output files to the output directory
7. Update `package.json` export metadata (only when `allowUpdatePackageJson: true`)

## Related pages

- [Configuration File Structure](/guide/config-file-structure)
- [Entry Points](/guide/entry-points)
- [Key Features](/guide/key-features)
- [Quick Start](/guide/quick-start)
