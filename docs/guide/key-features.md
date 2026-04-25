# Key Features

This page explains the main capabilities of susee and why they matter for library package workflows. Each feature is designed to keep TypeScript package builds simple, predictable, and publish-ready.

## TypeScript-first build flow

Susee is built around TypeScript library development, not application bundling. It compiles your package source while preserving a package-oriented workflow, including declaration output for consumers and clean library artifacts.

## Dual output support

Susee can produce both ESM and CommonJS outputs from the same entry definition. This helps you ship packages that work smoothly with modern import-based environments and older require-based ecosystems at the same time.

## Automatic duplicate symbol handling

When source consolidation produces conflicting declarations, susee can automatically rename duplicates. This reduces manual cleanup work and helps prevent collisions that would otherwise break build output.

## Fast, low-overhead builds

Susee focuses on the library use case, so the build pipeline avoids unnecessary app-level complexity. The result is a leaner build cycle that fits package development and release workflows.

## Package metadata update support

Susee can update relevant package metadata after build output is generated. This makes it easier to keep published package fields aligned with what was actually built.

## Plugin extension points

You can extend build behavior through plugins to fit project-specific requirements. This gives you flexibility for custom processing without replacing your whole build toolchain.

For plugin categories, execution order, and implementation examples, see [Plugin Types and Lifecycle](/guide/plugin-types-lifecycle).

## CLI and programmatic API

Susee supports both command-line usage and direct integration through its build API. Use the CLI for local development and CI commands, or call the API when you need custom scripting and orchestration.

## Why these features matter

Together, these features make susee a strong choice for TypeScript library maintainers who want reliable outputs, broad module compatibility, and a straightforward path from source code to npm-ready packages.
