//! Config-based build command.
//!
//! Ported from `src/nodejs/cli/build.ts`.
//!
//! Loads `susee.config.json` via [`super::config::final_susee_config`] and
//! runs the [`crate::compiler::Compiler`]. Mirrors the `cliBuild` function.

use std::time::Instant;

use crate::compiler::Compiler;

use super::config::final_susee_config;
use super::lib::fail::fail;

/// Run a config-based build.
///
/// Mirrors `cliBuild()` from `build.ts`. Prints a `[Build]` timer line, loads
/// the susee config, constructs a [`Compiler`], and runs it. Exits with code
/// 1 (via [`fail`]) when no config file is found or when the compiler fails.
pub fn cli_build() {
    let start = Instant::now();
    let build_options = match final_susee_config() {
        Ok(Some(opts)) => opts,
        Ok(None) => fail("No susee.config file (\"susee.config.json\") found"),
        Err(e) => fail(&e),
    };
    let mut compiler = Compiler::new(build_options);
    if let Err(e) = compiler.compile() {
        fail(&format!("build failed: {e}"));
    }
    let elapsed = start.elapsed().as_secs_f64();
    eprintln!("[Build]  {elapsed:.2}s");
}
