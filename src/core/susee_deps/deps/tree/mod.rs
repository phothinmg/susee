//! Dependency tree builder and module-type handlers.
//!
//! Re-exports [`susee_tree`] (the main entry point) and the individual
//! handlers for CommonJS ([`cjs_handler`]), CTS ([`cts_handler`]), and
//! JSON ([`json_handler`]) modules.

mod cjs_handler;
mod cts_handler;
mod index;
mod json_handler;

pub use index::susee_tree;
