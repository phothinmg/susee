//! Post-process hooks — run after the bundle is assembled.
//!
//! Currently provides [`minify_js`] for minifying the final output via
//! oxc's minifier.

mod minify;

pub use minify::minify_js;
