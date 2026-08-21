//! Built-in plugins.
//!
//! These ship with susee so users have working examples of each hook stage.
//!
//! ## Contents
//! - [`TreePlugin`] — a `dependency` plugin skeleton demonstrating the
//!   "tree(ast) plugin" hook from the project notes. It logs the dep files
//!   the tree contains and leaves them unchanged — a starting point for
//!   plugins that manage npm modules / node builtins.

use super::context::{DependencyPayload, PluginContext};
use super::plugin::{Plugin, PluginError};
use super::types::PluginType;

// ---------------------------------------------------------------------------
// TreePlugin
// ---------------------------------------------------------------------------

/// A dependency-stage plugin skeleton — the "tree(ast) plugin" hook from
/// the project notes.
///
/// By default it only logs the dep files it sees (when `SUSEE_PROFILE` is
/// on) and leaves the tree unchanged. Subclass by replacing `on_dependencies`
/// with logic that manages npm modules / node builtins / AST-level edits.
pub struct TreePlugin {
    name: String,
    /// When `true`, logs each dep file path during the dependency hook.
    pub verbose: bool,
}

impl Default for TreePlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl TreePlugin {
    pub fn new() -> Self {
        Self {
            name: "tree".to_string(),
            verbose: false,
        }
    }

    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.name = name.into();
        self
    }

    pub fn verbose(mut self, verbose: bool) -> Self {
        self.verbose = verbose;
        self
    }
}

impl Plugin for TreePlugin {
    fn name(&self) -> &str {
        &self.name
    }

    fn stages(&self) -> &[PluginType] {
        &[PluginType::Dependency]
    }

    fn on_dependencies(
        &self,
        ctx: &PluginContext<'_>,
        payload: DependencyPayload,
    ) -> Result<DependencyPayload, PluginError> {
        if self.verbose {
            eprintln!(
                "[tree-plugin:{}]: {} dep file(s)",
                ctx.entry,
                payload.deps_files.len()
            );
            for f in &payload.deps_files {
                eprintln!("  - {} ({} bytes)", f.file, f.bytes);
            }
        }
        Ok(payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tree_plugin_passes_through_unchanged() {
        use super::super::dispatcher::dispatch_dependencies;
        use crate::core::dependensa::{DepsFile, ModuleType, ValidExts};
        let p: Box<dyn Plugin> = Box::new(TreePlugin::new());
        let ctx = PluginContext::for_bundler("e.ts");
        let payload = DependencyPayload {
            deps_files: vec![DepsFile {
                file: "a.ts".into(),
                content: "x".into(),
                bytes: 1,
                module_type: ModuleType::Esm,
                file_ext: ValidExts::Ts,
                is_jsx: false,
                is_entry: false,
            }],
        };
        let out = dispatch_dependencies(&[p], &ctx, payload, "test").unwrap();
        assert_eq!(out.deps_files.len(), 1);
        assert_eq!(out.deps_files[0].content, "x");
    }

    #[test]
    fn plugin_names_default_and_custom() {
        assert_eq!(TreePlugin::new().name(), "tree");
    }
}
