//! Programmatic build API.
//!
//! Ported from the `build()` function in `src/nodejs/index.ts`.
//!
//! This is the public API for embedding consumers and the N-API bridge —
//! anything that wants to run a susee build **without** going through the
//! CLI dispatcher. It returns `Result` rather than exiting the process.
//!
//! ## Contents
//! - [`build`] — build from an in-memory [`SuSeeConfig`].
//! - [`build_from_config_file`] — build from a `susee.config.json` on disk
//!   (default discovery or an explicit path).
//!
//! ## Relationship to the CLI
//! The CLI's `cli_build()` (in [`crate::cli::build`]) is a thin wrapper
//! around [`build_from_config_file`] that converts `Err` into `fail(...)`
//! (process exit). Keeping the programmatic API here — separate from
//! `crate::cli` — makes the "library vs. binary" boundary explicit:
//! `crate::cli` is the CLI surface, `crate::api` is the library surface.

pub mod build;

pub use build::{build, build_from_config_file};
