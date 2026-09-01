//! Core type definitions for the `susee_types` crate.
//!
//! This crate exposes shared types used across the SUSEE workspace for
//! representing dependencies and module information.
mod index;
pub use index::{
    DepReturns, DependenciesTree, DepsFile, JsxDetector, ModuleType, ModuleTypeDetector,
    OutputFormat, ProjectType, ValidExts,
};
