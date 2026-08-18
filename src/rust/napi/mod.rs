//! N-API JS bridge for susee's Rust AST engine.
//!
//! This module is the replacement for the TS Transformer APIs
//! (`ts.SourceFile` / `ts.Node` / `ts.createSourceFile` / `ts.transform` /
//! `ts.createPrinter`) that became unstable in TS7. It exposes oxc's parser
//! and AST to JavaScript plugin authors via [`napi-rs`].
//!
//! Only built when the `napi` cargo feature is enabled:
//! ```sh
//! cargo build --release --features napi
//! ```
//! The resulting `cdylib` is loaded by Node as a native addon (see
//! `src/nodejs/native/` for the JS-side wrapper).
//!
//! ## Why JSON-backed nodes
//!
//! oxc's `Program<'a>` borrows from an `Allocator<'a>`, which makes it
//! self-referential and unsafe to store directly in a napi object (the JS
//! object outlives any single Rust call). To avoid lifetime gymnastics we
//! serialize the parsed AST to a `serde_json::Value` once, at parse time,
//! and expose nodes as plain JSON to JS. This gives plugin authors:
//!
//! - A familiar, plain-JS-object AST they can walk with `for...in` / array
//!   methods / destructuring — no native node handles to manage.
//! - Cheap round-trips (oxc's `serialize` feature is already enabled).
//! - Full compatibility with the existing `#[napi]` macro story.
//!
//! The trade-off is that JS plugins cannot *mutate* the AST in place and
//! re-print it the way `ts.transform` did. Instead, plugins transform the
//! *source string* at the `pre-process` / `post-process` stages (see
//! [`crate::plugins`]), or produce a new source string from the JSON view.
//! A future revision can add a mutable AST round-trip if needed.
//!
//! ## Exposed API
//! - [`parse_source_file`] — parse TS/JS source into a [`SourceFile`].
//! - [`SourceFile::print`] — pretty-print the AST back to source.
//! - [`SourceFile::to_json`] — return the AST as a JSON string.
//! - [`SourceFile::program`] — return the AST as a JS object.
//! - Node predicates ([`is_import_declaration`], [`is_export_declaration`],
//!   [`is_identifier`], ...).
//! - [`visit`] — walk the AST and call a JS callback for each node.
//!
//! ## Contents
//! - [`source_file`] — the [`SourceFile`] napi class.
//! - [`parse`] — the `parseSourceFile` function.
//! - [`predicates`] — node-type predicates.
//! - [`visitor`] — AST visitor that calls back into JS.

pub mod build_driver;
pub mod deps_files;
pub mod parse;
pub mod predicates;
pub mod source_file;
pub mod visitor;

pub use build_driver::build_with_plugins;
pub use parse::parse_source_file;
pub use source_file::SourceFile;
