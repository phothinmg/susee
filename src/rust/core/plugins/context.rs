//! Plugin context.
//!
//! Replaces the positional hook arguments from the TS plugin system
//! (`func(code, file?)`, `func(depsFiles, compilerOptions)`) with a single
//! extensible context object.

use crate::core::config::{CompilerOptions, OutputFormat};
use crate::core::dependensa::DepsFile;

/// Metadata passed to every plugin hook.
///
/// Each hook receives a mutable borrow of this context plus its specific
/// payload, so plugins can inspect the entry path, output format, and
/// compiler options without a long parameter list.
#[derive(Debug)]
pub struct PluginContext<'a> {
    /// The entry file path for the current build point.
    pub entry: &'a str,
    /// The output format being emitted (`Esm` or `Commonjs`).
    ///
    /// `None` for hooks that run before format selection (e.g.
    /// `on_dependencies`).
    pub format: Option<OutputFormat>,
    /// The compiler options in effect for the current compile step.
    ///
    /// `None` for hooks that run before compiler options are resolved
    /// (e.g. `on_dependencies` in the bundler).
    pub compiler_options: Option<&'a CompilerOptions>,
}

impl<'a> PluginContext<'a> {
    /// Build a minimal context for the bundler's dependency / pre-process
    /// hooks (no format, no compiler options yet).
    pub fn for_bundler(entry: &'a str) -> Self {
        Self {
            entry,
            format: None,
            compiler_options: None,
        }
    }

    /// Build a context for the compiler's post-process hook.
    pub fn for_compiler(
        entry: &'a str,
        format: OutputFormat,
        compiler_options: &'a CompilerOptions,
    ) -> Self {
        Self {
            entry,
            format: Some(format),
            compiler_options: Some(compiler_options),
        }
    }
}

/// Payload for the `on_dependencies` hook.
///
/// Wraps the `Vec<DepsFile>` so we can extend it later (e.g. with the
/// `DependenciesTree` or a name-resolution map) without changing the hook
/// signature.
#[derive(Debug)]
pub struct DependencyPayload {
    pub deps_files: Vec<DepsFile>,
}

/// Payload for the `on_pre_process` hook.
#[derive(Debug)]
pub struct PreProcessPayload {
    pub content: String,
}

/// Payload for the `on_post_process` hook.
#[derive(Debug)]
pub struct PostProcessPayload {
    pub code: String,
}
