//! N-API build driver — the JS entry point for running a susee build with
//! JS plugins.
//!
//! This is the counterpart to the pure-Rust [`crate::api::build`]. JS calls
//! [`build_with_plugins`], passing a config path and three arrays of JS
//! plugin callbacks (one per stage). The driver:
//!
//! 1. Loads & normalizes the susee config into [`BuildOptions`].
//! 2. Wraps each JS callback (a `ThreadsafeFunction` at the napi boundary
//!    — Send + Sync) in a [`JsPlugin`].
//! 3. Injects the `JsPlugin`s into the build entry points.
//! 4. Spawns the build on `spawn_blocking` so the JS event loop is free
//!    to service the TSFN callbacks (sync or async JS plugins).
//! 5. Returns a `Promise` that resolves on success / rejects on failure.
//!
//! ## Why three callback arrays instead of one `plugins[]` of objects
//!
//! `#[napi] async fn` requires the generated future to be `Send`. napi
//! `Object` params hold `*mut napi_env__` (not `Send`), so a single
//! `plugins: Vec<Object>` makes the future non-Send. `ThreadsafeFunction`
//! params are `Send + Sync` and cross the await boundary cleanly. The
//! JS-side wrapper (`src/nodejs/native/index.ts`) normalizes the user's
//! `plugins[]` (object + factory forms) into the three arrays + names.
//!
//! ## Sync + async JS plugins
//! napi's `call_async` resolves both sync returns and Promises, so a JS
//! callback may be sync (`(depsFiles, ctx) => { ... }`) or async
//! (`async (code, entry) => await minify(code)`).

use napi::bindgen_prelude::spawn_blocking;
use napi_derive::napi;

use crate::cli::config::{generate_build_options, get_susee_config_path, read_config_file};
use crate::compiler::types::BuildOptions;
use crate::plugins::js_plugin::{CodeTsfn, DepsTsfn};
use crate::plugins::{JsPlugin, Plugin};

/// Build `JsPlugin`s from the three callback arrays + parallel name arrays.
fn build_plugins(
    deps: Vec<DepsTsfn>,
    deps_names: Vec<Option<String>>,
    pre: Vec<CodeTsfn>,
    pre_names: Vec<Option<String>>,
    post: Vec<CodeTsfn>,
    post_names: Vec<Option<String>>,
) -> Vec<Box<dyn Plugin>> {
    let mut out: Vec<Box<dyn Plugin>> = Vec::new();
    for (i, tsfn) in deps.into_iter().enumerate() {
        let name = deps_names
            .get(i)
            .cloned()
            .flatten()
            .unwrap_or_else(|| "anonymous".to_string());
        out.push(Box::new(JsPlugin::new(name, Some(tsfn), None, None)));
    }
    for (i, tsfn) in pre.into_iter().enumerate() {
        let name = pre_names
            .get(i)
            .cloned()
            .flatten()
            .unwrap_or_else(|| "anonymous".to_string());
        out.push(Box::new(JsPlugin::new(name, None, Some(tsfn), None)));
    }
    for (i, tsfn) in post.into_iter().enumerate() {
        let name = post_names
            .get(i)
            .cloned()
            .flatten()
            .unwrap_or_else(|| "anonymous".to_string());
        out.push(Box::new(JsPlugin::new(name, None, None, Some(tsfn))));
    }
    out
}

/// Inject the plugin list into the build options.
///
/// `Box<dyn Plugin>` is not `Clone`, so the list is moved into the first
/// entry point only. The common case is a single entry point.
fn inject_plugins(opts: &mut BuildOptions, plugins: Vec<Box<dyn Plugin>>) {
    for point in &mut opts.build_entry_points {
        point.plugins = Vec::new();
    }
    if let Some(first) = opts.build_entry_points.first_mut() {
        first.plugins = plugins;
    }
}

/// Run a susee build from a config file with JS plugins.
///
/// This is the JS-facing replacement for the TS `build()` API. JS calls
/// it to run a full build (bundler + compiler) with JS-authored plugins
/// hooked into the `dependency`, `pre-process`, and `post-process`
/// stages. Both sync and async JS plugins are supported.
///
/// # Arguments
/// * `configPath` — Path to a `susee.config.json`, or `null` for default
///   discovery.
/// * `depsPluginFuncs` — `dependency`-stage JS callbacks.
/// * `depsPluginNames` — Parallel names for `depsPluginFuncs` (or `null`s).
/// * `preProcessPluginFuncs` — `pre-process`-stage JS callbacks.
/// * `preProcessPluginNames` — Parallel names.
/// * `postProcessPluginFuncs` — `post-process`-stage JS callbacks.
/// * `postProcessPluginNames` — Parallel names.
///
/// # Returns
/// A `Promise<void>` that resolves on success / rejects with an error.
///
/// # JS usage
/// The JS-side wrapper (`src/nodejs/native/index.ts`) groups these into a
/// single `plugins[]` array. Direct call:
/// ```js
/// import { buildWithPlugins } from "susee/native";
/// await buildWithPlugins(null, [], [], [], [], [
///   async (code, entry) => (await import("terser")).minify(code).code,
/// ], ["terser"]);
/// ```
#[napi]
pub async fn build_with_plugins(
    config_path: Option<String>,
    deps_plugin_funcs: Vec<DepsTsfn>,
    deps_plugin_names: Vec<Option<String>>,
    pre_process_plugin_funcs: Vec<CodeTsfn>,
    pre_process_plugin_names: Vec<Option<String>>,
    post_process_plugin_funcs: Vec<CodeTsfn>,
    post_process_plugin_names: Vec<Option<String>>,
) -> napi::Result<()> {
    // 1. Load & normalize the config.
    let config_path_buf = match config_path {
        Some(p) => std::path::PathBuf::from(p),
        None => get_susee_config_path().ok_or_else(|| {
            napi::Error::new(
                napi::Status::GenericFailure,
                "No susee.config file (\"susee.config.json\") found.\n\
                 Use `susee init` to create config file.",
            )
        })?,
    };
    if !config_path_buf.exists() {
        return Err(napi::Error::new(
            napi::Status::GenericFailure,
            format!("Config file {} does not exist", config_path_buf.display()),
        ));
    }
    let config = read_config_file(&config_path_buf)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e))?;
    let mut build_options = generate_build_options(&config)
        .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e))?;

    // 2. Build JsPlugins from the TSFN params (all Send+Sync).
    let js_plugins = build_plugins(
        deps_plugin_funcs,
        deps_plugin_names,
        pre_process_plugin_funcs,
        pre_process_plugin_names,
        post_process_plugin_funcs,
        post_process_plugin_names,
    );

    // 3. Inject plugins into the build options.
    inject_plugins(&mut build_options, js_plugins);

    // 4. Run the build on `spawn_blocking` so the JS event loop is free to
    //    service TSFN callbacks (sync or async).
    let join = spawn_blocking(move || -> std::result::Result<(), String> {
        let mut compiler = crate::compiler::Compiler::new(build_options);
        compiler.compile().map_err(|e| format!("build failed: {e}"))
    });

    match join.await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(napi::Error::new(napi::Status::GenericFailure, e)),
        Err(e) => Err(napi::Error::new(
            napi::Status::GenericFailure,
            format!("build task panicked: {e}"),
        )),
    }
}
