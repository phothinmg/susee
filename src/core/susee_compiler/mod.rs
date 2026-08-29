//! Compiler pipeline.
//!
//! ## Contents
//! - [`types`] — `OutputFormat`, `BuildEntryPoint`, `BuildOptions`,
//!   `CompiledOutput`, `OutFiles`.
//! - [`options`] — compiler-option normalization (`tsconfig`-like).
//! - [`susee_compiler`] — the core compile step (parse → transform → emit).
//! - [`index`] — the [`Compiler`] driver that walks entry points and writes
//!   files, mirroring the TS `Compiler` class.

mod cjs;
mod dts;
mod esm;
mod index;
mod source_map;
mod susee_compiler;

pub use index::Compiler;
