//! Pre-process hooks — run before the bundle is assembled.
//!
//! Provides [`clean`] (tree-shaking of unused declarations) from the
//! [`unused_code`] submodule.

pub mod unused_code;
