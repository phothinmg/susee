//! Bundler pipeline.
//!
//! Ported from `src/nodejs/bundler/` (the TypeScript implementation).
//!
//! This module ties together the dependency tree (from [`crate::dependencies`])
//! with a series of AST-level transforms — resolve JSON modules, handle
//! `export default`, anonymous exports/imports, remove imports/exports,
//! merge content, and clean unused code — to produce a single bundled string.
//!
//! ## Contents
//! - [`types`] — shared types (`NamesSet`, `BundlerResult`).
//! - [`helpers`] — utilities (`create_source_file`, `transform_source`, path helpers).
//! - [`unique_name`] — unique name generator.
//! - [`resolve_json`] — JSON module resolution.
//! - [`export_default`] — `export default` renaming.
//! - [`anonymous`] — anonymous export/import handling.
//! - [`remove`] — import/export removal.
//! - [`unused_code`] — unused code elimination.
//! - [`index`] — [`bundler`] entry point.

mod anonymous;
mod export_default;
mod helpers;
mod index;
mod remove;
mod resolve_json;
mod types;
mod unique_name;
mod unused_code;

pub use index::{bundle, bundler};
pub use types::NamesSet;
