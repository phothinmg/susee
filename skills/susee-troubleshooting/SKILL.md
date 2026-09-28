---
name: susee-troubleshooting
description: "Diagnose and fix failing susee builds: duplicate declaration conflicts, entry/exportPath validation errors, invalid CLI flags or boolean values, missing config files, tsconfig resolution problems, minify or check failures, and JSX runtime errors. Use when a susee build/bundle/check command errors, exits non-zero, or produces unexpected output."
---

# Susee Troubleshooting

This skill diagnoses failures in builds produced by the `susee` TypeScript library bundler. For setup and normal build usage, see the `susee-build` skill.

Susee exits with code `1` on failure and code `0` on success. All errors are logged through a shared error reporter that prints an info line plus a cause line — always read the **cause** line, it names the exact trigger.

## When to Use

- `susee build`, `susee bundle`, or `susee check` exits with code 1
- A build error mentions duplicate declarations, entry points, or export paths
- CLI flags are rejected (`Type of ... must be boolean`, `Format must be ...`)
- Output artifacts are missing or `package.json` was not updated as expected

## Diagnostic Table

| Error info | Cause | Fix |
| ---------- | ---- | --- |
| At least one entry required | No entry found in config or build options | Add at least one object to `entryPoints` |
| Found duplicated export paths/path | Two entries share the same `exportPath` | Give every entry a unique `exportPath` (e.g. `"."`, `"./cli"`) |
| Entry file error | Entry file does not exist (resolved from cwd) | Fix the `entry` path; it must exist on disk. For CLI builds, positional entries must end in `.js`, `.ts`, `.mts`, `.mjs`, `.cjs`, `.cts`, `.tsx`, or `.jsx` |
| Entry point already exists | A second entry was provided on the CLI | Pass only one entry — either positional or `--entry`, never both |
| Entry point required | `--entry` was passed without a value | Provide a value: `--entry src/index.ts` |
| Output directory required | `--outdir` was passed without a value | Provide a value: `--outdir dist` |
| Tsconfig path required | `--tsconfig` was passed without a value | Provide a value: `--tsconfig tsconfig.build.json` |
| Type of ... must be boolean | A boolean flag got a non-boolean value | Use `--flag=true`, `--flag false`, or a bare `--flag` (implies `true`) |
| Format must be cjs, commonjs, esm, both | Invalid `--format` value | Use one of: `cjs`, `commonjs`, `esm`, `both` (`cjs` = `commonjs`; `both` = ESM + CJS) |
| value must be "true" or "false" (bundle) | Invalid boolean for bundle flags | Use `--check=true|false` |
| Duplicate declaration failure | Source consolidation produced conflicting top-level declarations | Rename one of the conflicting top-level declarations in your source files — susee **fails fast** instead of renaming automatically; the error includes file and location info |

## Diagnostic Flow

1. **Read the error.** Identify the info line and cause line in the output. Match the info line against the table above.
2. **Check the config first** for config-based builds:
   - `entryPoints` is non-empty
   - Every `entry` path exists on disk
   - `exportPath` values are unique
   - Boolean fields (`minify`, `checks.*`, `allowUpdatePackageJson`) are actual booleans or objects
3. **Check the CLI invocation** for flag builds:
   - Only one entry (positional or `--entry`, not both)
   - Boolean flags use valid syntax (`--flag`, `--flag=true|false`, `--flag true|false`)
   - `--format` uses an accepted value
4. **Validate the tsconfig chain** if compilation options look wrong. Priority order is: entry-level `tsconfigFilePath` → root `tsconfig.json` → susee defaults. Passing `--tsconfig`/`tsconfigFilePath` overrides the root file.
5. **Re-run** with checks enabled to surface more issues: `npx susee build <entry> --check` or `npx susee check` (checks every config entry without writing output).

## Known Failure Categories

### Duplicate declarations

When the bundled dependency tree contains conflicting top-level declarations (e.g. the same exported name consolidated from multiple files), the build fails with file and location output rather than renaming identifiers. This is intentional — resolve the conflict in source code by renaming one of the declarations.

### JSX runtime validation

If bundled output contains JSX, susee validates the JSX runtime before compiling. Errors here mean the runtime could not be resolved — either React is not resolvable or the configured `jsxImportSource` is invalid. Install the runtime or fix `jsxImportSource` in the tsconfig that governs the entry.

### package.json not updated

`package.json` (`exports`, `main`, `module`, `types`) is only updated when `allowUpdatePackageJson` is `true` (config) or `--allow-update=true` (CLI). The default is `false`. Enable it and rebuild. Also verify the `type` field in `package.json` matches the emitted formats.

### Blank lines stripped from template literals (pre-v0.2.4 bundler)

Versions of `@suseejs/susee_bundler` before the blank-line fix strip empty lines inside template literals: `\n\n` inside a backtick template becomes a single `\n` in bundled output. If your bundled output is missing blank lines in template strings, upgrade `@suseejs/susee_bundler` to **v0.2.4 or above**. (Old workaround: insert a placeholder like `<!--BLANK-->` on its own line and chain `.replace(/<!--BLANK-->/g, "")` at runtime.)

## Verification

After applying a fix, confirm the specific failure is gone:

```sh
npx susee check          # validate config entries and lint without writing output
npx susee build          # full build, expect exit code 0
echo $?                  # 0 on success, 1 on failure
```

Also verify artifacts under `outDir` (default `dist`) match the configured `format` per entry, and that non-`.` `exportPath` entries produced subdirectories (e.g. `"./foo"` → `dist/foo`).