//! Library entry point for susee's Rust static-analysis engine.
//!
//! Re-exports the public API so that integration tests (in `tests/`) and
//! external consumers can access the graph and dependency modules without
//! reaching into private paths.

pub mod dependencies;
pub mod graph;