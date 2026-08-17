//! Integration tests for the plugin/hook system.
//!
//! Verifies that plugins are dispatched at each pipeline stage
//! (dependency → pre-process → post-process) with the right payloads and
//! that their transformations flow through to the final output.

use std::fs;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use tempfile::tempdir;

use susee::bundler::bundler;
use susee::plugins::{
    DependencyPayload, MinifyPlugin, Plugin, PluginContext, PluginError, PluginType,
    PostProcessPayload, PreProcessPayload, TreePlugin,
};

// ---------------------------------------------------------------------------
// Test plugins
// ---------------------------------------------------------------------------

/// A dependency plugin that injects a real statement into each dep file's
/// content. We inject a statement (not a comment) because the bundler's
/// clean-unused-code and pretty-print passes run *after* the dependency
/// hook and would strip a bare comment.
struct InjectStatement;
impl Plugin for InjectStatement {
    fn name(&self) -> &str {
        "inject-statement"
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
            // Prepend a side-effecting statement so clean-unused-code keeps it.
            f.content = format!("console.log(42);\n{}", f.content);
        }
        Ok(payload)
    }
}

/// A pre-process plugin that uppercases the bundled content.
struct Uppercase;
impl Plugin for Uppercase {
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

/// A pre-process plugin that records how many times it was called, so we
/// can verify the dispatch actually happened.
struct CountingPre {
    calls: std::sync::Arc<AtomicUsize>,
}
impl Plugin for CountingPre {
    fn stages(&self) -> &[PluginType] {
        &[PluginType::PreProcess]
    }
    fn on_pre_process(
        &self,
        _ctx: &PluginContext<'_>,
        payload: PreProcessPayload,
    ) -> Result<PreProcessPayload, PluginError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Ok(payload)
    }
}

/// A plugin that participates in all three stages, recording each.
struct OmniLogger {
    log: std::sync::Arc<Mutex<Vec<&'static str>>>,
}
impl Plugin for OmniLogger {
    fn stages(&self) -> &[PluginType] {
        &[
            PluginType::Dependency,
            PluginType::PreProcess,
            PluginType::PostProcess,
        ]
    }
    fn on_dependencies(
        &self,
        _ctx: &PluginContext<'_>,
        payload: DependencyPayload,
    ) -> Result<DependencyPayload, PluginError> {
        self.log.lock().unwrap().push("dependency");
        Ok(payload)
    }
    fn on_pre_process(
        &self,
        _ctx: &PluginContext<'_>,
        payload: PreProcessPayload,
    ) -> Result<PreProcessPayload, PluginError> {
        self.log.lock().unwrap().push("pre-process");
        Ok(payload)
    }
    fn on_post_process(
        &self,
        _ctx: &PluginContext<'_>,
        payload: PostProcessPayload,
    ) -> Result<PostProcessPayload, PluginError> {
        self.log.lock().unwrap().push("post-process");
        Ok(payload)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// The `TreePlugin` (dependency stage) should not alter the bundle by
/// default — it's a pass-through skeleton.
#[test]
fn tree_plugin_passes_through_bundle() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("dep.ts"), "export const x = 1;\n").unwrap();
    fs::write(
        root.join("entry.ts"),
        "import { x } from \"./dep.ts\";\nconsole.log(x);\n",
    )
    .unwrap();

    let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(TreePlugin::new())];
    let out = bundler("entry.ts", root, &plugins).expect("bundler failed");
    assert!(out.contains("console.log"));
}

/// A dependency plugin's edits to `DepsFile` content flow into the bundle.
///
/// Note: the bundler runs clean-unused-code and pretty-print *after* the
/// dependency hook, so we inject a real side-effecting statement (not a
/// comment) that survives those passes.
#[test]
fn dependency_plugin_edits_flow_into_bundle() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("dep.ts"), "export const x = 1;\n").unwrap();
    fs::write(
        root.join("entry.ts"),
        "import { x } from \"./dep.ts\";\nconsole.log(x);\n",
    )
    .unwrap();

    let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(InjectStatement)];
    let out = bundler("entry.ts", root, &plugins).expect("bundler failed");
    assert!(
        out.contains("console.log(42)"),
        "dependency plugin's injected statement should appear in bundle, got: {out}"
    );
}

/// A pre-process plugin transforms the final bundled content.
#[test]
fn pre_process_plugin_transforms_bundle() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("dep.ts"), "export const x = 1;\n").unwrap();
    fs::write(
        root.join("entry.ts"),
        "import { x } from \"./dep.ts\";\nconsole.log(x);\n",
    )
    .unwrap();

    let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(Uppercase)];
    let out = bundler("entry.ts", root, &plugins).expect("bundler failed");
    assert!(
        out.contains("CONSOLE.LOG"),
        "pre-process plugin should uppercase content, got: {out}"
    );
}

/// The dispatcher actually calls the plugin (not just no-ops).
#[test]
fn dispatcher_actually_invokes_hook() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("entry.ts"), "console.log(1);\n").unwrap();

    let calls = std::sync::Arc::new(AtomicUsize::new(0));
    let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(CountingPre {
        calls: calls.clone(),
    })];
    let _ = bundler("entry.ts", root, &plugins).expect("bundler failed");
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "pre-process hook should run once"
    );
}

/// Multiple plugins run in order, each seeing the previous one's output.
#[test]
fn plugins_chain_in_order() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    // Use a side-effecting entry so clean-unused-code doesn't drop it.
    fs::write(root.join("entry.ts"), "console.log(1);\n").unwrap();

    // First uppercases, second should see uppercased input and append.
    struct AppendSuffix;
    impl Plugin for AppendSuffix {
        fn stages(&self) -> &[PluginType] {
            &[PluginType::PreProcess]
        }
        fn on_pre_process(
            &self,
            _ctx: &PluginContext<'_>,
            payload: PreProcessPayload,
        ) -> Result<PreProcessPayload, PluginError> {
            Ok(PreProcessPayload {
                content: format!("{}// suffix\n", payload.content),
            })
        }
    }

    let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(Uppercase), Box::new(AppendSuffix)];
    let out = bundler("entry.ts", root, &plugins).expect("bundler failed");
    // Pre-process runs after pretty-print, so the uppercased content and
    // the suffix both survive in the final output.
    assert!(
        out.contains("CONSOLE.LOG"),
        "first plugin should uppercase: {out}"
    );
    assert!(
        out.contains("// suffix"),
        "second plugin should append: {out}"
    );
}

/// An empty plugin list behaves like no plugins at all (no regressions).
#[test]
fn empty_plugin_list_is_noop() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("entry.ts"), "console.log(1);\n").unwrap();

    let plugins: Vec<Box<dyn Plugin>> = vec![];
    let out = bundler("entry.ts", root, &plugins).expect("bundler failed");
    assert!(out.contains("console.log"));
}

/// A plugin error propagates out of the bundler.
#[test]
fn plugin_error_propagates() {
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
            Err(PluginError::new("deliberate failure"))
        }
    }

    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("entry.ts"), "console.log(1);\n").unwrap();

    let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(Boom)];
    let err = bundler("entry.ts", root, &plugins).unwrap_err();
    assert!(
        err.to_string().contains("deliberate failure"),
        "error should propagate: {err}"
    );
}

/// The built-in `MinifyPlugin` strips comments from compiled output via the
/// post-process hook. We test the hook directly (not the full compiler) to
/// keep the test fast and focused.
#[test]
fn minify_plugin_strips_comments_via_hook() {
    use susee::plugins::dispatch_post_process;
    let p: Box<dyn Plugin> = Box::new(MinifyPlugin::new());
    let ctx = PluginContext::for_bundler("entry.ts");
    let payload = PostProcessPayload {
        code: "const x = 1; // remove me\nconst y = 2;".to_string(),
    };
    let out = dispatch_post_process(&[p], &ctx, payload, "test").unwrap();
    assert!(!out.code.contains("remove me"));
    assert!(out.code.contains("const x = 1;"));
}

/// An omni-stage plugin is called at each of the three stages during a
/// full bundler run. (We only exercise dependency + pre-process here since
/// the bundler doesn't run post-process; that's the compiler's job. We
/// verify the dependency and pre-process hooks fire.)
#[test]
fn omni_stage_plugin_called_at_each_bundler_stage() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    fs::write(root.join("entry.ts"), "console.log(1);\n").unwrap();

    let log = std::sync::Arc::new(Mutex::new(Vec::new()));
    let plugins: Vec<Box<dyn Plugin>> = vec![Box::new(OmniLogger { log: log.clone() })];
    let _ = bundler("entry.ts", root, &plugins).expect("bundler failed");
    let recorded = log.lock().unwrap().clone();
    assert!(
        recorded.contains(&"dependency"),
        "dependency hook should fire"
    );
    assert!(
        recorded.contains(&"pre-process"),
        "pre-process hook should fire"
    );
    // The bundler does not run post-process; that's the compiler's job.
    assert!(
        !recorded.contains(&"post-process"),
        "post-process should NOT fire in bundler"
    );
}
