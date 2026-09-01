//! Core build pipeline for the SuSee bundler.
//!
//! This module aggregates all subsystems involved in turning a
//! TypeScript/JavaScript project into bundled output:
//!
//! - [`susee_build`] — orchestrates the full build from a config file.
//! - [`susee_bundler`] — resolves dependencies, applies hooks, and
//!   produces a single bundled source string.
//! - [`susee_cli`] — command-line interface (`susee build`, `susee init`).
//! - [`susee_compiler`] — emits JS, `.d.ts`, and source maps per format.
//! - [`susee_config`] — parses and normalizes `susee.config.jsonc`.
//! - [`susee_deps`] — dependency graph generation and tree building.
//! - [`susee_hooks`] — tree-shaking, import/export removal, minification.
//! - [`susee_log`] — colored console output for errors, warnings, timing.
//! - [`susee_types`] — shared types (`DepsFile`, `ProjectType`, etc.).
//! - [`susee_utils`] — shared helpers (AST parsing, file I/O, renaming).

mod susee_build;
mod susee_bundler;
mod susee_cli;
mod susee_compiler;
mod susee_config;
mod susee_deps;
mod susee_hooks;
pub mod susee_log;
mod susee_types;
mod susee_utils;

pub use susee_build::build;
pub use susee_bundler::bundler;
pub use susee_cli::susee_cli_build_with_args;
pub use susee_config::{EntryPoint, SuSeeConfig};
pub use susee_deps::{GraphObject, generate_graph};
pub use susee_types::OutputFormat;
