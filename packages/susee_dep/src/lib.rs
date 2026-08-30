//! Core library for the SUSEE dependency crate.
//!
//! This crate provides graph-based data structures and utilities
//! used throughout the SUSEE project.

/// Graph data structures and operations.
pub mod graph;
/// A reusable graph object abstraction.
///
/// Re-exported from the [`graph`] module for convenience.
pub use graph::GraphObject;
/// Generates a new graph instance.
///
/// Re-exported from the [`graph`] module for convenience.
pub use graph::generate_graph;
