//! Config-based CLI build command.
//!
//! Ported from `src/nodejs/cli/build.ts` (`cliBuild`).
//!
//! This is the CLI surface — it exits the process on error. The
//! programmatic API lives at [`crate::api`].

use crate::core::susee_build::build;

use super::lib::fail::fail;

/// Run a config-based build as a CLI command.
///
/// Mirrors `cliBuild()` from `build.ts`. Loads the susee config, constructs
/// a [`Compiler`], and runs it. Exits with code 1 (via [`fail`]) when no
/// config file is found or when the compiler fails.
///
/// This is a thin wrapper around [`crate::api::build_from_config_file`]
/// that converts `Err` into `fail(...)` (process exit) and passes `None`
/// to use default `susee.config.json` discovery. Programmatic callers
/// should use [`crate::api::build_from_config_file`] directly.
pub fn cli_build() {
    build(None);
}
