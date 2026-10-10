# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-10-10

susee v3.0.0 is driven by the **core bundler upgrade** — `@suseejs/susee_bundler` from `^0.2.4` to `^0.3.0` (released today as [`v0.3.0`](https://github.com/suseejs/susee_bundler/releases/tag/v0.3.0) in the [`susee_bundler`](https://github.com/suseejs/susee_bundler) repository). Most of the changes below live in the core bundler; this repo bumps the dependency, adjusts package metadata, and updates documentation.

### ⚠️ Breaking / behavioral changes

- **Duplicate declarations are now auto-renamed instead of failing the build.** The core bundler's new `duplicate_handler` proactively renames cross-file duplicate top-level declarations (functions, classes, variables, type aliases, interfaces, enums) to unique names (`_uhelper$1`, `_uhelper$2`, …) during bundling. Builds that previously exited with a "duplicate declaration" error now succeed with renamed declarations. Entry files and exported declarations are never touched, so the public API surface stays intact. If you relied on the build *failing* to catch duplicates, run `susee lint` (the duplicate check is still reported there).
- **Stricter npm dependency checks** (core bundler, applies to `susee build` and `susee lint`):
  - Every imported npm package must now be **explicitly declared** in `package.json` (`dependencies` or `devDependencies`). Transitive packages that merely exist in `node_modules/` because another package pulled them in are no longer accepted — the build errors with `npm-not-declared`.
  - Every declared package must be **actually installed** in `node_modules/` (symlink-aware, so pnpm's symlinked layout works correctly).
- **Bundling checks moved to lint-only** (core bundler): the duplicates / undefined-usage checks and the opt-in `checkDefaultExports` / `checkAnonymous` checks no longer run during the bundling tree stage — they are surfaced through `susee lint` instead. The corresponding *handlers* (default-export naming, anonymous naming) still run during bundling.

### Added

- **`export * from "…"` support in entry files** (core bundler). Entry-file star re-exports of local modules are now expanded into explicit named exports (`export { a, b as c }`) before import stripping. Previously the star statement survived into the flat bundle pointing at an inlined module path, breaking the public API at runtime. Chained stars are followed recursively, `export type *` expands to type-only exports, and ES-spec ambiguity rules are honored (ambiguous names are excluded; `export * as ns` is kept unchanged with a warning). Adds `tests/bundler_star_test.rs` and `examples/star_demo.rs` in the core bundler repo.
- **Agent skills** (this repo): `susee-build`, `susee-troubleshooting`, and `susee-contribution` skills — installable via `npx skills add phothinmg/susee` — plus a README section documenting them.

### Fixed

- **Blank lines inside multi-line template literals are no longer stripped** (core bundler; [BUGS.md](BUGS.md) bug #1). All line-filtering steps in the bundler pipeline (dependency merging, CJS/CTS conversion) are now template-literal-aware: blank/`;`-only lines are dropped only *outside* template literals, while blank lines *inside* backtick template literals are preserved verbatim. The `<!--BLANK-->` placeholder workaround documented in [BUGS.md](BUGS.md) is no longer needed.

### Changed

- **Package exports** (this repo):
  - `types` now points to `dist/index.d.mts` (was `dist/index.d.cts`).
  - The `./cli` subpath export no longer offers a `require` (CommonJS) condition — the CLI is importable via ESM only.
- **Core bundler is now dual-format**: the `@suseejs/susee_bundler` package ships an ESM entry (`index.mjs`) alongside `index.cjs` with a proper `exports` map (`types` / `import` / `require`).
- **Docs** (this repo): README reworked (oxc badge, `create-susee` scaffolding guide, wording), CLI reference code fences annotated, and [BUGS.md](BUGS.md) added documenting known-bug status since v2.3.0.

### Migration notes

- If your build previously failed on duplicate top-level declarations across files, it will now build — declarations are renamed with a `_u<name>$<n>` sigil. Run `npx susee lint` to see duplicate diagnostics.
- Make sure every npm package you import is listed in `package.json`, then run `npm install` / `pnpm install` — the new check rejects undeclared (merely hoisted) dependencies.
- Remove any `<!--BLANK-->` placeholder workarounds for template literals; blank lines are preserved now.

## [2.3.0] - 2026-09-07

The core bundler was ported from TypeScript to Rust (powered by [oxc](https://oxc.rs)), fixing multiple bugs present in earlier versions. See the [v2.3.0 release notes](https://github.com/phothinmg/susee/releases/tag/v2.3.0) and [BUGS.md](BUGS.md).