//! Error helper.
//!
//! Ported from `src/nodejs/cli/lib/fail.ts`.
//!
//! The TS version prints a magenta-tagged error and calls `process.exit(1)`.
//! In Rust we mirror the formatting and exit behavior via [`std::process::exit`],
//! so callers don't need to thread `Result`s through every flag check.

use std::process::exit;

/// Print an error message tagged `[Error]` to stderr and exit with code 1.
///
/// Mirrors `fail(message)` from `fail.ts`. The tag is plain text instead of
/// magenta ANSI since the Rust CLI does not depend on a color crate yet.
pub fn fail(message: &str) -> ! {
    eprintln!("[Error] : {message}");
    exit(1);
}
