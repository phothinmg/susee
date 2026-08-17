//! Library entry point for susee's Rust static-analysis engine.
//!
//! Re-exports the public API so that integration tests (in `tests/`) and
//! external consumers can access the graph and dependency modules without
//! reaching into private paths.
//!
//! The `napi` module is only compiled when the `napi` cargo feature is
//! enabled, since it pulls in the Node native-addon headers.

pub mod bundler;
pub mod cli;
pub mod compiler;
pub mod dependencies;
pub mod graph;
pub mod plugins;

#[cfg(feature = "napi")]
pub mod napi;
