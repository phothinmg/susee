//! Compiler pipeline.
//!
//! Ported from `src/nodejs/compiler/` (the TypeScript implementation).
//!
//! The compiler takes a bundled string (from [`crate::bundler`]) and emits
//! the final module output plus type declarations. Unlike the TS port, which
//! delegates to `@suseejs/ts6` (`ts.createProgram`) for emit, the Rust
//! implementation uses [`oxc`] for parsing and codegen and a small built-in
//! pass for `.d.ts` generation. This avoids the dependency on the TS
//! Transformer APIs that became unstable in TS7.
//!
//! ## Contents
//! - [`types`] — `OutputFormat`, `BuildEntryPoint`, `BuildOptions`,
//!   `CompiledOutput`, `OutFiles`.
//! - [`options`] — compiler-option normalization (`tsconfig`-like).
//! - [`susee_compiler`] — the core compile step (parse → transform → emit).
//! - [`index`] — the [`Compiler`] driver that walks entry points and writes
//!   files, mirroring the TS `Compiler` class.

pub mod index;
pub mod options;
pub mod susee_compiler;
pub mod types;

pub use index::Compiler;
pub use options::{CompilerOptions, ModuleKind, get_compiler_options};
pub use susee_compiler::{CompiledOutput, susee_compiler};
pub use types::{BuildEntryPoint, BuildOptions, OutFiles, OutputFormat};
