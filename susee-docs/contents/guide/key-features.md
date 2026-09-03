---
layout: docs
label: guide
title: Key Features
---

This page explains the main capabilities of susee and why they matter for library package workflows. Each feature is designed to keep TypeScript package builds simple, predictable, and publish-ready.

## TypeScript-first build flow

Susee is built around TypeScript library development, not application bundling. It compiles your package source using `@suseejs/ts6` (a TypeScript compiler) while preserving a package-oriented workflow, including declaration output for consumers and clean library artifacts.

## Dual output support

Susee can produce both ESM and CommonJS outputs from the same entry definition. This helps you ship packages that work smoothly with modern import-based environments and older require-based ecosystems at the same time.

Output file extensions:

- ESM: `.mjs`, `.d.mts`, `.mjs.map`
- CommonJS: `.cjs`, `.d.cts`, `.cjs.map`

## Duplicate declaration validation

When source consolidation produces conflicting top-level declarations, susee fails the build with file and location output. This keeps the emitted bundle deterministic and pushes name conflicts back to the source files that caused them.

## Fast, low-overhead builds

Susee focuses on the library use case, so the build pipeline avoids unnecessary app-level complexity. The result is a leaner build cycle that fits package development and release workflows.

## Package metadata update support

Susee can update relevant package metadata (`exports`, `main`, `module`, `types`) after build output is generated when `allowUpdatePackageJson` is enabled. This makes it easier to keep published package fields aligned with what was actually built.

## Built-in minification

When `minify` is enabled per entry point (or `--minify` on the CLI), susee runs the oxc minifier (`oxc-minify`) — compression + mangling — over the final emitted JavaScript before writing it to disk. If the minifier cannot parse the code, susee falls back to the unminified source so the build never breaks on an edge case.

## Bundler lint checks

Susee provides optional lint checks on the bundled output via the `checks` field on each entry point:

- `checkAnonymous` — detect anonymous default exports/imports
- `checkDefaultExports` — lint default export patterns
- `checkNpmInstalled` — verify referenced npm modules are installed, treating missing ones as fatal

On the CLI, the `--check` flag enables all three checks simultaneously.

## JSX support

Susee automatically detects JSX syntax in the bundled source. When JSX is found, it validates that either a React runtime import or the configured `jsxImportSource` is present, then adjusts compiler options accordingly (setting `jsx: ReactJSX` and appropriate `lib` values).

## CLI and programmatic API

Susee supports both command-line usage and direct integration through its async `build()` API. Use the CLI for local development and CI commands, or call the API when you need custom scripting and orchestration.

## Why these features matter

Together, these features make susee a strong choice for TypeScript library maintainers who want reliable outputs, broad module compatibility, and a straightforward path from source code to npm-ready packages.
