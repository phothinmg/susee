//! Standalone binary entry point for the SuSee build system.
//!
//! When compiled as a native binary (not via napi-rs), this crate
//! produces a `susee` executable that reads `susee.config.jsonc` from
//! the current directory and runs the full build pipeline.
//!
//! For Node.js usage, see [`lib.rs`](crate), which exposes `#[napi]`
//! functions callable from JavaScript.

use susee::susee_build;
fn main() {
    susee_build(None);
}
