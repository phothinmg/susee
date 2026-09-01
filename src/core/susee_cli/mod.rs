//! CLI module — command-line interface for `susee`.
//!
//! Re-exports [`susee_cli_build_with_args`] (used by the napi binding) and
//! the internal [`cli_options`] / [`cli_utils`] submodules.

mod cli_options;
mod cli_utils;
mod index;

pub use index::susee_cli_build_with_args;
