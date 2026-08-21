//! Plugin dispatcher.
//!
//! Ported from the inline `for (const plugin of plugins) { ... }` loops in
//! `src/nodejs/bundler/index.ts` (steps 2 and 10) and
//! `src/nodejs/compiler/index.ts` (step 5).
//!
//! The dispatcher walks the plugin list, filters by stage, calls the
//! matching hook, profiles the call, and propagates the first error.

use std::time::Instant;

use super::context::{DependencyPayload, PluginContext, PostProcessPayload, PreProcessPayload};
use super::plugin::{Plugin, PluginError};
use super::types::PluginType;

/// Log a plugin phase if `SUSEE_PROFILE` is enabled, mirroring the
/// `logBundlerPhase` / `logCompilerPhase` calls in the TS dispatchers.
fn log_plugin_phase(scope: &str, plugin_name: &str, stage: PluginType, start: Instant) {
    if std::env::var("SUSEE_PROFILE").is_ok_and(|v| v == "1" || v == "true") {
        let ms = start.elapsed().as_secs_f64() * 1000.0;
        eprintln!(
            "[SUSEE_PROFILE][{scope}] {}:{plugin_name}: {ms:.1}ms",
            stage.profile_prefix()
        );
    }
}

/// Run all `dependency`-stage plugins, mirroring the step-2 loop in
/// `bundler/index.ts`.
///
/// `scope` is the profiling scope label (e.g. `"bundler:entry.ts"`).
pub fn dispatch_dependencies(
    plugins: &[Box<dyn Plugin>],
    ctx: &PluginContext<'_>,
    mut payload: DependencyPayload,
    scope: &str,
) -> Result<DependencyPayload, PluginError> {
    for p in plugins {
        if !p.stages().contains(&PluginType::Dependency) {
            continue;
        }
        let start = Instant::now();
        payload = p.on_dependencies(ctx, payload)?;
        log_plugin_phase(scope, p.name(), PluginType::Dependency, start);
    }
    Ok(payload)
}

/// Run all `pre-process`-stage plugins, mirroring the step-10 loop in
/// `bundler/index.ts`.
pub fn dispatch_pre_process(
    plugins: &[Box<dyn Plugin>],
    ctx: &PluginContext<'_>,
    mut payload: PreProcessPayload,
    scope: &str,
) -> Result<PreProcessPayload, PluginError> {
    for p in plugins {
        if !p.stages().contains(&PluginType::PreProcess) {
            continue;
        }
        let start = Instant::now();
        payload = p.on_pre_process(ctx, payload)?;
        log_plugin_phase(scope, p.name(), PluginType::PreProcess, start);
    }
    Ok(payload)
}

/// Run all `post-process`-stage plugins, mirroring the step-5 loop in
/// `compiler/index.ts`.
pub fn dispatch_post_process(
    plugins: &[Box<dyn Plugin>],
    ctx: &PluginContext<'_>,
    mut payload: PostProcessPayload,
    scope: &str,
) -> Result<PostProcessPayload, PluginError> {
    for p in plugins {
        if !p.stages().contains(&PluginType::PostProcess) {
            continue;
        }
        let start = Instant::now();
        payload = p.on_post_process(ctx, payload)?;
        log_plugin_phase(scope, p.name(), PluginType::PostProcess, start);
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::dependensa::{DepsFile, ModuleType, ValidExts};

    /// A plugin that appends a marker to every dep file's content.
    struct AppendDep;
    impl Plugin for AppendDep {
        fn name(&self) -> &str {
            "append-dep"
        }
        fn stages(&self) -> &[PluginType] {
            &[PluginType::Dependency]
        }
        fn on_dependencies(
            &self,
            _ctx: &PluginContext<'_>,
            mut payload: DependencyPayload,
        ) -> Result<DependencyPayload, PluginError> {
            for f in &mut payload.deps_files {
                f.content.push_str("// appended\n");
            }
            Ok(payload)
        }
    }

    /// A plugin that uppercases bundled content.
    struct Upper;
    impl Plugin for Upper {
        fn stages(&self) -> &[PluginType] {
            &[PluginType::PreProcess]
        }
        fn on_pre_process(
            &self,
            _ctx: &PluginContext<'_>,
            payload: PreProcessPayload,
        ) -> Result<PreProcessPayload, PluginError> {
            Ok(PreProcessPayload {
                content: payload.content.to_uppercase(),
            })
        }
    }

    /// A plugin that minifies (collapses whitespace) post-emit.
    struct Squash;
    impl Plugin for Squash {
        fn name(&self) -> &str {
            "squash"
        }
        fn stages(&self) -> &[PluginType] {
            &[PluginType::PostProcess]
        }
        fn on_post_process(
            &self,
            _ctx: &PluginContext<'_>,
            payload: PostProcessPayload,
        ) -> Result<PostProcessPayload, PluginError> {
            Ok(PostProcessPayload {
                code: payload
                    .code
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" "),
            })
        }
    }

    /// A plugin that always errors.
    struct Boom;
    impl Plugin for Boom {
        fn stages(&self) -> &[PluginType] {
            &[PluginType::PreProcess]
        }
        fn on_pre_process(
            &self,
            _ctx: &PluginContext<'_>,
            _payload: PreProcessPayload,
        ) -> Result<PreProcessPayload, PluginError> {
            Err(PluginError::new("boom"))
        }
    }

    fn ctx() -> PluginContext<'static> {
        // Leak-free: use a static string for the entry in tests.
        PluginContext::for_bundler("entry.ts")
    }

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
    fn dependency_plugin_mutates_deps() {
        let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(AppendDep)];
        let payload = DependencyPayload {
            deps_files: vec![dep("a.ts", "x"), dep("b.ts", "y")],
        };
        let out = dispatch_dependencies(&plugins, &ctx(), payload, "test").unwrap();
        assert_eq!(out.deps_files[0].content, "x// appended\n");
        assert_eq!(out.deps_files[1].content, "y// appended\n");
    }

    #[test]
    fn pre_process_plugin_transforms_content() {
        let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(Upper)];
        let payload = PreProcessPayload {
            content: "hello".to_string(),
        };
        let out = dispatch_pre_process(&plugins, &ctx(), payload, "test").unwrap();
        assert_eq!(out.content, "HELLO");
    }

    #[test]
    fn post_process_plugin_transforms_code() {
        let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(Squash)];
        let payload = PostProcessPayload {
            code: "a   b\n c".to_string(),
        };
        let out = dispatch_post_process(&plugins, &ctx(), payload, "test").unwrap();
        assert_eq!(out.code, "a b c");
    }

    #[test]
    fn dispatcher_skips_non_matching_stage() {
        // A post-process plugin should not run in the pre-process dispatcher.
        let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(Squash)];
        let payload = PreProcessPayload {
            content: "hello".to_string(),
        };
        let out = dispatch_pre_process(&plugins, &ctx(), payload, "test").unwrap();
        assert_eq!(out.content, "hello");
    }

    #[test]
    fn dispatcher_propagates_first_error() {
        let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(Boom), Box::new(Upper)];
        let payload = PreProcessPayload {
            content: "hello".to_string(),
        };
        let err = dispatch_pre_process(&plugins, &ctx(), payload, "test").unwrap_err();
        assert!(err.message.contains("boom"));
    }

    #[test]
    fn default_hooks_are_noop() {
        struct Idle;
        impl Plugin for Idle {
            fn stages(&self) -> &[PluginType] {
                &[
                    PluginType::Dependency,
                    PluginType::PreProcess,
                    PluginType::PostProcess,
                ]
            }
        }
        let p = Idle;
        let ctx = PluginContext::for_bundler("e.ts");
        let dp = DependencyPayload { deps_files: vec![] };
        let dp_out = p.on_dependencies(&ctx, dp).unwrap();
        assert!(dp_out.deps_files.is_empty());
        let pp = PreProcessPayload {
            content: "x".into(),
        };
        let pp_out = p.on_pre_process(&ctx, pp).unwrap();
        assert_eq!(pp_out.content, "x");
        let po = PostProcessPayload { code: "y".into() };
        let po_out = p.on_post_process(&ctx, po).unwrap();
        assert_eq!(po_out.code, "y");
    }
}
