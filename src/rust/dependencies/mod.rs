//! Dependency collection pipeline.
//!
//! Ported from `node_src/dependencies/` (the TypeScript implementation).
//!
//! This module ties together the graph analysis (`crate::graph`) with module
//! type detection and duplicate-declaration checking to produce a
//! [`DependenciesTree`].
//!
//! ## Contents
//! - [`types`] — shared types (`DependenciesTree`, `DepsFile`, `ValidExts`, …).
//! - [`duplicates`] — duplicate declaration detection.
//! - [`index`] — [`generate_dependencies`] entry point.

pub mod duplicates;
pub mod index;
pub mod types;

#[allow(unused_imports)]
pub use duplicates::{DuplicateDeclaration, DuplicateDeclarationLocation, check_duplicates};
pub use index::generate_dependencies;
#[allow(unused_imports)]
pub use types::{DependenciesTree, DepsFile, ModuleType, ValidExts};
