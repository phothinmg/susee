//! AST handlers for detecting import/require/module specifiers.
//!
//! [`oxc`] to parse JS/TS source and an AST visitor
//! ([`oxc::ast_visit::Visit`] implementation) to collect module specifiers.

pub mod visit;

pub use visit::collect_module_specifiers;
