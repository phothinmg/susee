//! `JsPlugin` — a [`Plugin`] adapter that calls back into JavaScript.
//!
//! This is the bridge that lets plugin authors write plugins in JS using
//! susee-provided APIs (no TS APIs), wired into the Rust core's trait-based
//! plugin system. Both **sync and async** JS plugins are supported.
//!
//! ## How it works
//!
//! The napi build driver (`src/rust/napi/build_driver.rs`) exposes an
//! `#[napi] async fn build_with_plugins(..)` that JS calls. JS plugin
//! callbacks arrive as [`napi::threadsafe_function::ThreadsafeFunction`]
//! params (Send + Sync, so they can be stored in `Box<dyn Plugin>` and
//! called from the Rust build thread).
//!
//! The build runs via `spawn_blocking`, so the JS event loop is **not
//! blocked** while the build runs. When a hook fires, `JsPlugin` calls
//! the TSFN and blocks the build thread on the result via
//! [`napi::bindgen_prelude::block_on`] — the JS loop is free to run the
//! callback (sync or async; a returned Promise is awaited automatically by
//! napi's `call_async`).
//!
//! This keeps the sync [`Plugin`] trait and the existing
//! bundler/compiler dispatch unchanged — `JsPlugin` is just another
//! `Box<dyn Plugin>` from their perspective.
//!
//! ## Plugin forms (object + factory)
//!
//! Mirrors the existing `@suseejs/type` plugin shapes, re-homed as
//! susee-native types (see `src/nodejs/native/plugins.d.ts`):
//! - **Object form**: `{ type, async?, func, name? }`.
//! - **Factory form**: a function `() => PluginObject`.
//!
//! `async: true` JS plugins (returning a Promise) and sync plugins
//! (returning a plain value) are both handled by `call_async`.

use std::sync::{Arc, Mutex};

use napi::bindgen_prelude::{Function, block_on};
use napi::threadsafe_function::ThreadsafeFunction;

use super::context::{DependencyPayload, PluginContext, PostProcessPayload, PreProcessPayload};
use super::plugin::{Plugin, PluginError};
use super::types::PluginType;
use crate::compiler::options::CompilerOptions;
use crate::napi::deps_files::{
    DepsFileEntryData, DepsFiles, DepsFilesData, SuseeCompilerOptions, SuseePluginContext,
    deps_files_to_rust,
};

/// TSFN type for the `dependency` hook.
///
/// - `T` (payload sent across) = `(DepsFiles, SuseePluginContext)` — the
///   JS function receives these directly.
/// - `Return` = `()` (the hook mutates `depsFiles` in place).
/// - `CallJsBackArgs` = `(DepsFiles, SuseePluginContext)` (identity).
///
/// This matches the shape the napi build driver receives at the param
/// boundary, so a param TSFN can be passed straight into [`JsPlugin::new`].
pub type DepsTsfn =
    ThreadsafeFunction<(DepsFiles, SuseePluginContext), (), (DepsFiles, SuseePluginContext)>;

/// TSFN type for the `pre-process` / `post-process` hooks.
///
/// The callback receives `(code, entry)` and returns the transformed code
/// (string). napi's `call_async` resolves both sync returns and Promises.
pub type CodeTsfn = ThreadsafeFunction<(String, String), String, (String, String)>;

/// A [`Plugin`] adapter that dispatches to JavaScript callbacks via
/// threadsafe functions.
///
/// Stored as `Box<dyn Plugin>` alongside Rust-native plugins. Holds up to
/// three TSFNs — one per stage. Unset stages are no-ops.
pub struct JsPlugin {
    name: String,
    stages: Vec<PluginType>,
    on_deps: Option<DepsTsfn>,
    on_pre: Option<CodeTsfn>,
    on_post: Option<CodeTsfn>,
}

impl JsPlugin {
    /// Create a `JsPlugin` with the given name and optional TSFN
    /// callbacks. `stages()` is derived from which callbacks are set.
    pub fn new(
        name: impl Into<String>,
        on_deps: Option<DepsTsfn>,
        on_pre: Option<CodeTsfn>,
        on_post: Option<CodeTsfn>,
    ) -> Self {
        let mut stages = Vec::new();
        if on_deps.is_some() {
            stages.push(PluginType::Dependency);
        }
        if on_pre.is_some() {
            stages.push(PluginType::PreProcess);
        }
        if on_post.is_some() {
            stages.push(PluginType::PostProcess);
        }
        Self {
            name: name.into(),
            stages,
            on_deps,
            on_pre,
            on_post,
        }
    }
}

impl Plugin for JsPlugin {
    fn name(&self) -> &str {
        &self.name
    }

    fn stages(&self) -> &[PluginType] {
        &self.stages
    }

    fn on_dependencies(
        &self,
        ctx: &PluginContext<'_>,
        payload: DependencyPayload,
    ) -> Result<DependencyPayload, PluginError> {
        let Some(tsfn) = &self.on_deps else {
            return Ok(payload);
        };

        // Build the shared backing from the incoming payload.
        let backing = Arc::new(Mutex::new(DepsFilesData {
            entries: payload
                .deps_files
                .iter()
                .map(|d| Arc::new(Mutex::new(DepsFileEntryData::from(d.clone()))))
                .collect(),
            npm: Vec::new(),
            nodes: Vec::new(),
            warns: Vec::new(),
        }));
        let warns = Arc::new(Mutex::new(Vec::new()));

        // Build the JS-facing args: the DepsFiles wrapper + the context.
        let deps_files = DepsFiles {
            data: backing.clone(),
        };
        let plugin_ctx = SuseePluginContext {
            entry: ctx.entry.to_string(),
            format: ctx.format.map(|f| f.as_str().to_string()),
            compiler_options: SuseeCompilerOptions::from_rust(
                ctx.compiler_options
                    .map(|o| (*o).clone())
                    .as_ref()
                    .unwrap_or(&CompilerOptions::defaults()),
            ),
            warns: warns.clone(),
        };

        // Call the JS hook and block until it resolves (sync or async).
        block_on(tsfn.call_async(Ok((deps_files, plugin_ctx)))).map_err(|e| {
            PluginError::new(format!("dependency JS hook: {e}")).with_plugin(&self.name)
        })?;

        // Read mutations back from the shared backing.
        let handle = DepsFiles { data: backing };
        let new_deps = deps_files_to_rust(&handle).map_err(|e| PluginError::new(e.to_string()))?;

        // Surface any warnings the plugin pushed via ctx.warn().
        if let Ok(w) = warns.lock() {
            if !w.is_empty() {
                eprintln!("{}", w.join("\n"));
            }
        }

        Ok(DependencyPayload {
            deps_files: new_deps,
        })
    }

    fn on_pre_process(
        &self,
        ctx: &PluginContext<'_>,
        payload: PreProcessPayload,
    ) -> Result<PreProcessPayload, PluginError> {
        let Some(tsfn) = &self.on_pre else {
            return Ok(payload);
        };
        let code = block_on(tsfn.call_async(Ok((payload.content, ctx.entry.to_string()))))
            .map_err(|e| {
                PluginError::new(format!("pre-process JS hook: {e}")).with_plugin(&self.name)
            })?;
        Ok(PreProcessPayload { content: code })
    }

    fn on_post_process(
        &self,
        ctx: &PluginContext<'_>,
        payload: PostProcessPayload,
    ) -> Result<PostProcessPayload, PluginError> {
        let Some(tsfn) = &self.on_post else {
            return Ok(payload);
        };
        let code =
            block_on(tsfn.call_async(Ok((payload.code, ctx.entry.to_string())))).map_err(|e| {
                PluginError::new(format!("post-process JS hook: {e}")).with_plugin(&self.name)
            })?;
        Ok(PostProcessPayload { code })
    }
}

/// Create a `DepsTsfn` from a napi `Function` (for callers that have a
/// `Function` rather than a pre-built TSFN — e.g. non-driver paths).
pub fn create_deps_tsfn(
    func: Function<(DepsFiles, SuseePluginContext), ()>,
) -> napi::Result<DepsTsfn> {
    func.build_threadsafe_function()
        .callee_handled::<true>()
        .build()
}

/// Create a `CodeTsfn` from a napi `Function` (for pre/post-process hooks).
pub fn create_code_tsfn(func: Function<(String, String), String>) -> napi::Result<CodeTsfn> {
    func.build_threadsafe_function()
        .callee_handled::<true>()
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dependencies::types::{DepsFile, ModuleType, ValidExts};
    use crate::napi::deps_files::{deps_files_from_rust, deps_files_to_rust};

    fn dep(file: &str, content: &str) -> DepsFile {
        DepsFile {
            file: file.to_string(),
            content: content.to_string(),
            bytes: content.len(),
            module_type: ModuleType::Esm,
            file_ext: ValidExts::Ts,
            is_jsx: false,
            is_entry: false,
        }
    }

    #[test]
    fn deps_files_round_trip_preserves_entries() {
        let files = vec![dep("a.ts", "x"), dep("b.ts", "yy")];
        let df = deps_files_from_rust(files, vec!["pkg".into()], vec!["fs".into()], vec![]);
        let back = deps_files_to_rust(&df).unwrap();
        assert_eq!(back.len(), 2);
        assert_eq!(back[0].file, "a.ts");
        assert_eq!(back[0].content, "x");
        assert_eq!(back[1].bytes, 2);
    }

    #[test]
    fn js_plugin_no_callbacks_is_passthrough() {
        let p = JsPlugin::new("empty", None, None, None);
        assert!(p.stages().is_empty());
        let ctx = PluginContext::for_bundler("entry.ts");
        let payload = DependencyPayload {
            deps_files: vec![dep("a.ts", "x")],
        };
        let out = p.on_dependencies(&ctx, payload).unwrap();
        assert_eq!(out.deps_files.len(), 1);
    }
}
