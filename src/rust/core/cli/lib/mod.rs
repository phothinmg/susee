//! CLI helper library.
//!
//! Ported from `src/nodejs/cli/lib/`.
//!
//! ## Contents
//! - [`fail`] — error + exit helper (`fail.ts`).
//! - [`parse_argv`] — argument parser and options normalization
//!   (`parse_argv.ts`).
//! - [`print_help`] — `--help` text printer (`print_help.ts`).

pub mod fail;
pub mod parse_argv;
pub mod print_help;

pub use fail::fail;
pub use parse_argv::{
    CliBuildOptions, CliOptions, extract_profile_flag, get_default_options, parse_args,
};
pub use print_help::print_help;
