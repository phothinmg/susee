//! AST handlers for detecting import/require/module specifiers.
//!
//! Ported from `deps/lib/handlers/`. Instead of the TS compiler API, this uses
//! [`oxc`] to parse JS/TS source and a [`Visit`] implementation to collect
//! module specifiers.

pub mod visit;

pub use visit::collect_module_specifiers;
