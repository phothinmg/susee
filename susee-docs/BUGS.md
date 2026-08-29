# Susee — Known Bugs & Issues in `/src` (Rust)

> Last audited: 2026-08-29
>
> This document catalogues bugs found in the Rust source tree (`/src`).
> Previously-fixed bugs are listed in [§6](#6-previously-fixed-bugs-from-memory).

---

## 1. `susee_build` — `fs::exists().is_ok()` always true

| | |
|---|---|
| **File** | `src/core/susee_build/mod.rs:32` |
| **Severity** | High |
| **Status** | Open |

`build(None)` calls `fs::exists(&config_path).is_ok()`.  In Rust
`std::fs::exists` returns `io::Result<bool>` — `Ok(true)` when the file
exists, `Ok(false)` when it does not, `Err(_)` on I/O failure.

`.is_ok()` returns `true` for **both** `Ok(true)` and `Ok(false)`, so the
branch is entered even when the config file does not exist.  The subsequent
`read_config_file` call then fails (or panics via `.expect("")`).

**Fix:**

```rust
if matches!(fs::exists(&config_path), Ok(true)) {
```

or simply `if config_path.exists()`.

---

## 2. `susee_build` — `.expect("")` panics with empty message

| | |
|---|---|
| **File** | `src/core/susee_build/mod.rs:29, 31` |
| **Severity** | Medium |
| **Status** | Open |

```rust
let config_path = get_susee_config_path().expect("");   // line 29
let config_options = read_config_file(&config_path).expect(""); // line 31
```

If `get_susee_config_path()` returns `None` (no config on disk) the program
panics with an empty message.  If the config file is unreadable or invalid
JSON, same thing.  Combined with Bug 1 above, the `else` branch (which is
supposed to print a helpful error) is **never reached**.

**Fix:** handle the `None` / `Err` cases explicitly and print a useful
message before exiting.

---

## 3. Config file name mismatch: `init` writes `.json`, build reads `.jsonc`

| | |
|---|---|
| **Files** | `src/core/susee_cli/index.rs:46` (`cli_init`), `src/core/susee_config/config_types.rs:170` (`get_susee_config_path`) |
| **Severity** | High |
| **Status** | Open |

`cli_init()` writes the config as **`susee.config.json`**, but
`get_susee_config_path()` only looks for **`susee.config.jsonc`**.

Running `susee init` followed by `susee` (build) will therefore fail to find
the config file — the user gets a panic (via Bug 2) instead of a build.

**Fix:** add `"susee.config.json"` to the candidates list in
`get_susee_config_path`, or make `cli_init` write `.jsonc`.

---

## 4. CLI operator-precedence: `susee build -h` doesn't print help

| | |
|---|---|
| **File** | `src/core/susee_cli/index.rs:95` |
| **Severity** | Low |
| **Status** | Open |

```rust
if args.len() == 1 && args[0] == "--help" || args[0] == "-h" {
```

Due to operator precedence this parses as:

```rust
(args.len() == 1 && args[0] == "--help") || args[0] == "-h"
```

- When `args = ["build", "-h"]` (len 2): the first conjunct is false (len
  ≠ 1), the second checks `"build" == "-h"` → false.  Help is **not**
  printed; execution falls through to `parse_args` which reports
  "Entry point required".
- The `args.len() == 1` part is also dead code — single-arg `--help`/`-h`
  is already handled by the `args.len() == 1` match block above.

**Fix:**

```rust
if args.len() > 1 && args[0] == "build" && matches!(args[1].as_str(), "--help" | "-h") {
    print_help();
    return;
}
```

---

## 5. `source_map.rs` — unguarded `.unwrap()` on `SourceType::from_path`

| | |
|---|---|
| **File** | `src/core/susee_compiler/source_map.rs:11, 41` |
| **Severity** | Medium |
| **Status** | Open |

```rust
let source_type = SourceType::from_path(source_path).unwrap()…
```

`SourceType::from_path` returns `Result` and can fail for unusual or
missing extensions.  Both `sm_commonjs` and `sm_esm` will panic.

**Fix:** `.unwrap_or_default()` (the bundler already does this in
`pretty_print`).

---

## 6. `json_handler.rs` — `panic!` on invalid JSON

| | |
|---|---|
| **File** | `src/core/susee_tree/json_handler.rs:117` |
| **Severity** | Medium |
| **Status** | Open |

```rust
panic!("Invalid JSON syntax in dependency file: {file}")
```

The caller (`susee_tree`) returns `io::Result`, but this panic bypasses
error propagation entirely.  A malformed `.json` dependency crashes the
process instead of returning an `Err`.

**Fix:** return `Result<Vec<DepsFile>, io::Error>` and propagate with `?`.

---

## 7. `cts_handler` — stale `bytes` field after conversion

| | |
|---|---|
| **File** | `src/core/susee_tree/cts_handler.rs` (`cts_handler` function) |
| **Severity** | Low |
| **Status** | Open |

After rewriting CTS content (imports, exports), the `bytes` field is kept
as `dep.bytes` (the original file size) instead of recalculating from the
new content:

```rust
result.push(DepsFile {
    …
    bytes: dep.bytes,   // ← stale
    …
});
```

Downstream code that relies on `bytes` for progress reporting or size
checks will see incorrect values.

**Fix:** `bytes: content.len()`.

---

## 8. `cjs_handler` — `require()` only handled with `const`

| | |
|---|---|
| **File** | `src/core/susee_tree/cjs_handler.rs` (`process_require_var`) |
| **Severity** | Medium |
| **Status** | Open |

`process_require_var` returns `None` when `var_decl.kind !=
VariableDeclarationKind::Const`.  This means `let x = require("mod")` and
`var x = require("mod")` are silently skipped — the `require` call is
left in the output, producing invalid ESM.

**Fix:** accept `Let` and `Var` in addition to `Const`.

---

## 9. `anonymous.rs` — `find_keyword_end` can't handle generators

| | |
|---|---|
| **File** | `src/core/susee_hooks/tree_hooks/anonymous.rs` (`find_keyword_end`) |
| **Severity** | Low |
| **Status** | Open |

The `function*` check at the end of `find_keyword_end` is **unreachable**
because the `function` keyword check matches first (a `function*` string
starts with `function`).

`export default function*() {}` (anonymous generator) would get the name
inserted as `function _aname$1*()` instead of `function* _aname$1()`.

**Fix:** check `function*` **before** `function` in the keyword list.

---

## 10. `write_package_json` always forces `"type": "module"`

| | |
|---|---|
| **File** | `src/core/susee_compiler/index.rs` (`write_package_json`) |
| **Severity** | Low |
| **Status** | Open |

The `type` field is always set to `"module"`, even for CJS-only builds.
A CJS-only package should have `"type": "commonjs"` or no `"type"` field.

---

## 11. `build_export_entry` — `./` prefix + `../` relative path

| | |
|---|---|
| **File** | `src/core/susee_compiler/index.rs` (`build_export_entry`) |
| **Severity** | Low |
| **Status** | Open |

```rust
format!("./{}", rel(&files.esm))
```

When `rel` returns a path starting with `../` (entry point in a
subdirectory), this produces `.//../dist/...` which is invalid.

**Fix:** only prepend `./` when the relative path doesn't already start
with `../` or `./`.

---

## 12. `json_ext_to_ts` — `.replace(".json", ".ts")` replaces all occurrences

| | |
|---|---|
| **File** | `src/core/susee_utils/mod.rs` (`json_ext_to_ts`) |
| **Severity** | Low |
| **Status** | Open |

`file.replace(".json", ".ts")` replaces **every** occurrence of `.json`
in the path, not just the extension.  A path like
`foo.json/bar.json` becomes `foo.ts/bar.ts`.

**Fix:** use `file.strip_suffix(".json").map(|s| format!("{s}.ts"))`
and fall back to the original string.

---

## 13. `unused_code` — `BindingPattern::WithDefault` not collected

| | |
|---|---|
| **File** | `src/core/susee_hooks/pre_process_hooks/unused_code.rs` (`collect_binding_names`) |
| **Severity** | Low |
| **Status** | Open |

The match in `collect_binding_names` handles `BindingIdentifier`,
`ObjectPattern`, `ArrayPattern`, and `AssignmentPattern`, but not
`WithDefault`.  Destructuring with defaults like
`const [a = 1] = arr` would not have `a` collected as a defined name,
so it may be incorrectly removed as "unused".

---

## 14. `cjs.rs` — `expression_has_await` false-positive on strings

| | |
|---|---|
| **File** | `src/core/susee_compiler/cjs.rs` (`expression_has_await`) |
| **Severity** | Low |
| **Status** | Open |

The fallback branch uses `Codegen` to print the expression and checks
for `"await "` in the resulting text.  A string literal like
`"await foo"` would be treated as containing an await expression,
potentially wrapping the output in an unnecessary async IIFE.

---

## 15. `check_entries` — typo "dose not exists"

| | |
|---|---|
| **File** | `src/core/susee_config/config_types.rs` (`check_entries`) |
| **Severity** | Cosmetic |
| **Status** | Open |

```rust
return Err(format!("Entry file {} dose not exists.", ent.entry));
```

Should be "does not exist".

---

## 16. Dead / orphaned file: `cli_build.rs`

| | |
|---|---|
| **File** | `src/core/susee_cli/cli_build.rs` |
| **Severity** | Low |
| **Status** | Open |

`cli_build.rs` imports from `super::lib::fail::fail`, but no `lib`
module exists in `susee_cli`.  The file is also not declared as a module
in `susee_cli/mod.rs` (only `cli_options`, `cli_utils`, `index` are
declared).  This file is orphaned and will not compile if added as a
module.

---

## 6. Previously-fixed bugs (from memory)

These bugs were discovered and fixed earlier (documented in repo memory):

| # | Bug | File | Status |
|---|-----|------|--------|
| 1 | Bundler line filter used `\|\|` instead of `&&` | `susee_bundler/mod.rs` | ✅ Fixed |
| 2 | Duplicates hook generated invalid identifiers (raw file path) | `duplicates.rs` | ✅ Fixed |
| 3 | Duplicates hook renamed import bindings | `duplicates.rs` | ✅ Fixed |
| 4 | Duplicate detection missed `export const` declarations | `susee_utils/mod.rs` | ✅ Fixed |
| 5 | Bundler panicked on missing entry instead of returning `Err` | `susee_bundler`, `susee_tree` | ✅ Fixed |
| 6 | Tree hooks ran anonymous before export-default (double rename) | `susee_hooks/mod.rs` | ✅ Fixed |

All fixes have been verified in the current codebase.