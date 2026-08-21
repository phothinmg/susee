//! CLI pipeline.
//!
//! Ported from `src/nodejs/cli/` (the TypeScript implementation).
//!
//! Provides the native `susee` binary's command dispatch:
//! - `susee`                      → config-based build via [`build::cli_build`]
//! - `susee init`                 → generate `susee.config.json`
//! - `susee --help` / `-h`        → [`print_help`]
//! - `susee --version` / `-v`     → print version
//! - `susee build <entry> [opts]` → single-entry build via [`cli::cli_compiler_compile`]
//! - `susee --profile ...`        → enable phase timings
//!
//! ## Contents
//! - [`lib`] — `fail`, `parse_argv`, `print_help` helpers.
//! - [`config`] — `susee.config.json` loader and `BuildOptions` normalization.
//! - [`build`] — config-based build command.
//! - [`cli`] — single-entry CLI compiler.
//! - [`index`] — top-level dispatcher (`susee_cli_build`, `cli_init`).

pub mod build;
pub mod cli;
pub mod index;
pub mod lib;

pub use build::cli_build;
pub use cli::cli_compiler_compile;
pub use index::{cli_init, susee_cli_build};
pub use lib::{get_default_options, parse_args, print_help};

/// Shared mutex for tests that mutate the process-global cwd.
///
/// `std::env::set_current_dir` is process-global, so concurrent tests that
/// use relative paths race with cwd-changing tests. All such tests across
/// the cli module lock this mutex for their duration. Kept in the parent
/// module so `config` and `index` tests share a single lock.
#[cfg(test)]
pub(crate) static CWD_TEST_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());
