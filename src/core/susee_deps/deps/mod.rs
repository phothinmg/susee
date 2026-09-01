//! Dependency analysis sub-modules.
//!
//! - [`checks`] — pre-bundle diagnostics (duplicates, missing types, etc.).
//! - [`graph`] — dependency graph generation, topological sort, visualization.
//! - [`tree`] — dependency tree building with module-type handlers.

mod checks;
mod graph;
mod tree;

pub use graph::{GraphObject, generate_graph};
pub use tree::susee_tree;
