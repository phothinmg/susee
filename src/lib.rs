//! Native entry points for the SuSee build system.
//!
//! This crate exposes a small set of `#[napi]`-annotated functions that are
//! callable from Node.js (via `napi-rs`). Each function delegates to the
//! internal [`core`] module and reports timing through [`core::susee_log`].
//!
//! The re-exported [`SuSeeConfig`], [`EntryPoint`], and [`OutputFormat`] types
//! form the public configuration surface consumed by the JavaScript side.

mod core;
use colored::*;
use core::bundler;
pub use core::{EntryPoint, OutputFormat, SuSeeConfig};
use napi_derive::napi;
use std::time::Instant;

/// Runs the full SuSee build pipeline and exposes it to Node.js.
///
/// When `config` is `None`, the configuration is loaded from
/// `susee.config.jsonc` in the current working directory. When a
/// [`SuSeeConfig`] is provided, it overrides the file-based configuration.
///
/// After the build completes, the elapsed time is logged via
/// [`core::susee_log::build_time`].
///
/// # Panics
///
/// Propagates any panic originating from [`core::build`]; the caller (Node.js)
/// is responsible for converting such panics into rejected promises.
#[napi]
pub fn susee_build(config: Option<SuSeeConfig>) {
    let start = Instant::now();
    core::build(config.as_ref());
    core::susee_log::build_time(start);
}

/// Runs the SuSee CLI build from Node.js with an explicit argument list.
///
/// `args` should be `process.argv.slice(2)` — the user-supplied CLI arguments
/// with the Node executable and script path already stripped. The standalone
/// Rust binary reads `std::env::args_os().skip(1)`, which is correct for the
/// binary but wrong under Node (where `argv[0]` is `node` and `argv[1]` is the
/// bin script), so the arguments are passed explicitly here.
///
/// After the build completes, the elapsed time is logged via
/// [`core::susee_log::build_time`].
///
/// # Panics
///
/// Propagates any panic originating from [`core::susee_cli_build_with_args`].
#[napi]
pub fn cli_build(args: Vec<String>) {
    let start = Instant::now();
    core::susee_cli_build_with_args(args);
    core::susee_log::build_time(start);
}

/// Bundles an entry module into a single string and exposes it to Node.js.
///
/// `entry` is resolved relative to the current working directory (`.`). The
/// resulting [`bundler`] output is unwrapped and the bundled JavaScript code is
/// returned as a [`String`]. On failure, the error is printed in magenta via
/// the [`colored`] crate and the process panics.
///
/// After bundling completes, the elapsed time is logged via
/// [`core::susee_log::bundle_time`].
///
/// # Panics
///
/// Panics if [`bundler`] returns an error, printing the message
/// `"Error when bundling"` in magenta before unwinding.
#[napi]
pub fn susee_bundler(entry: String) -> std::string::String {
    let start = Instant::now();
    let bundled = bundler(&entry, ".")
        .expect(&"Error when bundling".magenta())
        .bundled_code;
    core::susee_log::bundle_time(start);
    bundled
}
