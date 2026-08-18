//! The [`Plugin`] trait.
//!
//! Replaces the structural `SuseePlugin` union from `@suseejs/type` with a
//! Rust trait. Each hook defaults to a no-op so a plugin only overrides
//! the stage(s) it cares about — mirroring how the TS dispatcher filters
//! by `type` and only calls the matching `func`.

use super::context::{DependencyPayload, PluginContext, PostProcessPayload, PreProcessPayload};
use super::types::PluginType;

/// The trait every susee plugin implements.
///
/// A plugin participates in one or more pipeline stages; override only the
/// hooks you need. The default implementations are no-ops that return the
/// payload unchanged.
///
/// # Error handling
///
/// Hooks return `Result<_, PluginError>` so a plugin can fail the build
/// with a descriptive message. The dispatcher propagates the first error
/// it sees, mirroring the TS behavior where a throwing `func` aborts the
/// build.
///
/// `Plugin` is `Send + Sync` so that plugin lists can cross the
/// `spawn_blocking` boundary in the napi build driver (JS plugin
/// callbacks are wrapped in `ThreadsafeFunction`, which is `Send + Sync`).
pub trait Plugin: Send + Sync {
    /// Human-readable name used in profiling output. Mirrors
    /// `_plugin.name ?? "anonymous"` in the TS dispatcher. Default is
    /// `"anonymous"`.
    fn name(&self) -> &str {
        "anonymous"
    }

    /// Which stages this plugin participates in.
    ///
    /// Used by the dispatcher to skip no-op plugins and by profiling to
    /// label phases. Mirrors the TS `type` field. A plugin that overrides
    /// both `on_pre_process` and `on_post_process` returns
    /// `&[PluginType::PreProcess, PluginType::PostProcess]`.
    fn stages(&self) -> &[PluginType];

    /// `dependency` stage — runs in the bundler on the `DepsFile` tree.
    ///
    /// Default: return the payload unchanged.
    fn on_dependencies(
        &self,
        ctx: &PluginContext<'_>,
        payload: DependencyPayload,
    ) -> Result<DependencyPayload, PluginError> {
        let _ = ctx;
        Ok(payload)
    }

    /// `pre-process` stage — runs in the bundler on the final bundled
    /// source string.
    ///
    /// Default: return the payload unchanged.
    fn on_pre_process(
        &self,
        ctx: &PluginContext<'_>,
        payload: PreProcessPayload,
    ) -> Result<PreProcessPayload, PluginError> {
        let _ = ctx;
        Ok(payload)
    }

    /// `post-process` stage — runs in the compiler on the emitted JS code.
    ///
    /// Default: return the payload unchanged.
    fn on_post_process(
        &self,
        ctx: &PluginContext<'_>,
        payload: PostProcessPayload,
    ) -> Result<PostProcessPayload, PluginError> {
        let _ = ctx;
        Ok(payload)
    }
}

/// Error returned by a plugin hook, mirroring a throwing `func` in the TS
/// version.
#[derive(Debug, Clone)]
pub struct PluginError {
    /// The name of the plugin that produced the error, if known.
    pub plugin: Option<String>,
    /// The human-readable error message.
    pub message: String,
}

impl PluginError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            plugin: None,
            message: message.into(),
        }
    }

    /// Attach the originating plugin's name.
    pub fn with_plugin(mut self, name: impl Into<String>) -> Self {
        self.plugin = Some(name.into());
        self
    }
}

impl std::fmt::Display for PluginError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.plugin {
            Some(name) => write!(f, "[plugin:{name}] {}", self.message),
            None => write!(f, "[plugin] {}", self.message),
        }
    }
}

impl std::error::Error for PluginError {}

impl From<PluginError> for std::io::Error {
    fn from(e: PluginError) -> Self {
        std::io::Error::new(std::io::ErrorKind::Other, e.to_string())
    }
}
