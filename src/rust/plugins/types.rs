//! Plugin stage tags.
//!
//! Ported from the `type` discriminator on `SuseePlugin` variants in
//! `@suseejs/type`.

use serde::{Deserialize, Serialize};

/// The pipeline stage a plugin hooks into.
///
/// Mirrors the `type` field of `PreProcessPlugin` / `PostProcessPlugin` /
/// `DependencyPlugin` from `@suseejs/type`.
///
/// A plugin may participate in multiple stages; see [`Plugin::stages`]
/// in [`super::plugin`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PluginType {
    /// Runs in the bundler on the `Vec<DepsFile>` tree, before the CommonJS
    /// check. Mirrors `type: "dependency"`. This is the "tree(ast) plugin"
    /// hook from the project notes.
    Dependency,
    /// Runs in the bundler on the final bundled source string, before the
    /// bundler returns. Mirrors `type: "pre-process"`.
    PreProcess,
    /// Runs in the compiler on the emitted JS code, before files are
    /// written. Mirrors `type: "post-process"`.
    PostProcess,
}

impl PluginType {
    /// The label used in profiling output, mirroring the TS
    /// `dependencyPlugin:` / `preProcessPlugin:` / `postProcessPlugin:`
    /// prefixes.
    pub fn profile_prefix(&self) -> &'static str {
        match self {
            Self::Dependency => "dependencyPlugin",
            Self::PreProcess => "preProcessPlugin",
            Self::PostProcess => "postProcessPlugin",
        }
    }
}
