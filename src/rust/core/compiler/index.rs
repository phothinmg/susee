//! Compiler driver.
//!
//! Ported from the `Compiler` class in `src/nodejs/compiler/index.ts`.
//!
//! The driver owns a [`BuildOptions`] and, for each entry point and each
//! requested [`OutputFormat`], runs:
//! 1. `bundle` (from [`crate::bundler`]) to produce the bundled source.
//!    The bundler dispatches `dependency` and `pre-process` plugins.
//! 2. [`super::susee_compiler::susee_compiler`] to emit JS, `.d.ts`, and
//!    (optionally) a source map.
//! 3. Post-process plugins via [`crate::plugins::dispatch_post_process`].
//! 4. Writes the emitted files to disk and updates `package.json` export
//!    metadata when `update_package` is enabled.
//!
//! Unlike the TS port, this is a synchronous implementation — file I/O is
//! already blocking, and the bundler is synchronous, so there's no benefit
//! to `async` here. A future N-API layer can expose async wrappers if
//! needed.

use std::path::{Path, PathBuf};
use std::time::Instant;

use super::susee_compiler::{CompilerParams, susee_compiler};
use crate::core::bundler::bundler;
use crate::core::config::{BuildEntryPoint, BuildOptions, OutputFormat, get_compiler_options};
use crate::core::plugins::{PluginContext, PostProcessPayload, dispatch_post_process};

/// Emitted artifact paths, mirroring `files.OutFiles` from the TS helpers.
///
/// Each field is `Some(path)` once the corresponding output has been written.
#[derive(Debug, Clone, Default)]
pub struct OutFiles {
    pub commonjs: Option<String>,
    pub commonjs_types: Option<String>,
    pub esm: Option<String>,
    pub esm_types: Option<String>,
    pub main: Option<String>,
    pub module: Option<String>,
    pub types: Option<String>,
}

/// Compiler for the Rust static-analysis engine.
///
/// Mirrors the TS `Compiler` class.
pub struct Compiler {
    object: BuildOptions,
    files: OutFiles,
    /// Cached bundled code per entry path, mirroring the WeakMap in the TS
    /// class. We key on the entry path string.
    bundled_cache: std::collections::HashMap<String, String>,
}

impl Compiler {
    /// Create a compiler with normalized build options.
    pub fn new(object: BuildOptions) -> Self {
        Self {
            object,
            files: OutFiles::default(),
            bundled_cache: std::collections::HashMap::new(),
        }
    }

    fn update(&self) -> bool {
        self.object.update_package
    }

    /// Bundle a single entry point, using the cache when available.
    ///
    /// Plugins are passed through to the bundler so `dependency` and
    /// `pre-process` hooks run during bundling. The cache keys on the entry
    /// path only — if a plugin is non-deterministic across runs, callers
    /// should avoid relying on the cache (or clear it between runs).
    fn bundle_entry(&mut self, point: &BuildEntryPoint) -> std::io::Result<String> {
        if let Some(cached) = self.bundled_cache.get(&point.entry) {
            return Ok(cached.clone());
        }
        let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let code = bundler(&point.entry, &cwd, &point.plugins)?;
        self.bundled_cache.insert(point.entry.clone(), code.clone());
        Ok(code)
    }

    /// Compile a single entry point in a single format.
    ///
    /// Mirrors the private `_commonjs` / `_esm` methods of the TS class.
    fn compile_format(
        &mut self,
        point: &BuildEntryPoint,
        format: OutputFormat,
    ) -> std::io::Result<()> {
        let is_main = point.is_main();
        let opts_builder = get_compiler_options(point.tsconfig_file_path.as_deref());
        let compiler_options = opts_builder.build(format, Some(&point.output_directory_path));

        // 1. Bundle.
        let bundled_code = self.bundle_entry(point)?;

        // 2. Detect JSX.
        let is_jsx = is_jsx_content(&bundled_code);

        // 3. Compile.
        let compiled = susee_compiler(CompilerParams {
            source_code: &bundled_code,
            file_name: &point.entry,
            compiler_options: &compiler_options,
            is_jsx,
        })
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        let mut compiled_code = compiled.code;

        // 4. Compute output paths and rewrite the source-map URL comment,
        //    mirroring the regex replace in `_commonjs`/`_esm`.
        let main_file_path = join_path(
            &compiled.out_dir,
            &format!("{}{}", compiled.file_name, format.module_ext()),
        );
        let dts_file_path = join_path(
            &compiled.out_dir,
            &format!("{}{}", compiled.file_name, format.dts_ext()),
        );
        let map_file_path = join_path(
            &compiled.out_dir,
            &format!("{}{}", compiled.file_name, format.map_ext()),
        );

        let js_map_name = format!("{}.js.map", compiled.file_name);
        let new_map_name = format!("{}{}", compiled.file_name, format.map_ext());
        compiled_code = compiled_code.replace(&js_map_name, &new_map_name);

        // 5. Post-process plugins — run on the emitted JS code before
        //    writing files, mirroring step 5 in `compiler/index.ts`.
        if !point.plugins.is_empty() {
            let phase_start = Instant::now();
            let scope = format!(
                "compiler:{}",
                Path::new(&point.entry)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&point.entry)
            );
            let ctx = PluginContext::for_compiler(&point.entry, format, &compiler_options);
            let payload = PostProcessPayload {
                code: compiled_code,
            };
            let payload = dispatch_post_process(&point.plugins, &ctx, payload, &scope)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            compiled_code = payload.code;
            let _ = phase_start; // profiling happens inside the dispatcher.
        }

        // 6. Record output paths for package.json updates.
        if self.update() {
            match format {
                OutputFormat::Commonjs => {
                    self.files.commonjs = Some(main_file_path.clone());
                    if compiled.dts.is_some() {
                        self.files.commonjs_types = Some(dts_file_path.clone());
                    }
                    if is_main && point.format.contains(&OutputFormat::Commonjs) {
                        if let Some(c) = &self.files.commonjs {
                            self.files.main = Some(c.clone());
                        }
                        if let Some(t) = &self.files.commonjs_types {
                            self.files.types = Some(t.clone());
                        }
                    }
                }
                OutputFormat::Esm => {
                    self.files.esm = Some(main_file_path.clone());
                    if compiled.dts.is_some() {
                        self.files.esm_types = Some(dts_file_path.clone());
                    }
                    if is_main && self.files.esm.is_some() {
                        self.files.module = self.files.esm.clone();
                    }
                }
            }
        }

        // 7. Write files.
        write_file(&main_file_path, &compiled_code)?;
        if let Some(dts) = &compiled.dts {
            write_file(&dts_file_path, dts)?;
        }
        if let Some(map) = &compiled.map {
            write_file(&map_file_path, map)?;
        }

        // 8. Update package.json when enabled.
        if self.update() {
            write_package_json(&self.files, &point.export_path)?;
        }

        Ok(())
    }

    /// Clear the output directory and compile all configured entry points.
    ///
    /// Mirrors the `compile()` method of the TS `Compiler` class.
    pub fn compile(&mut self) -> std::io::Result<()> {
        clear_folder(&self.object.out_dir)?;
        // Iterate by index so we can borrow `self.object` for the entry
        // point while borrowing `self` mutably for `compile_format`. We
        // can't `.clone()` the entry points because they own
        // `Vec<Box<dyn Plugin>>`, which is not `Clone`.
        let n = self.object.build_entry_points.len();
        for idx in 0..n {
            // Snapshot the format list up front — `compile_format` may
            // mutate `self` (the bundled cache), so we can't hold a borrow
            // of the entry point across the inner loop.
            let formats: Vec<OutputFormat> = self.object.build_entry_points[idx].format.clone();
            // Move the entry point out of `self.object` for the duration of
            // the inner loop, then put it back. This avoids the borrow
            // conflict without cloning the plugin list.
            let point = std::mem::take(&mut self.object.build_entry_points[idx]);
            for format in &formats {
                self.compile_format(&point, *format)?;
            }
            // Restore the entry point (its plugins are untouched by
            // `compile_format`, which only reads them).
            self.object.build_entry_points[idx] = point;
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers — small ports of `src/nodejs/helpers/files.ts` and
// `src/nodejs/helpers/utilities.ts::isJsxContent`.
// ---------------------------------------------------------------------------

/// Join path components, mirroring `files.joinPath`.
fn join_path(dir: &str, file: &str) -> String {
    let p = Path::new(dir).join(file);
    p.to_string_lossy().to_string()
}

/// Recursively remove the contents of a directory (but not the directory
/// itself), mirroring `files.clearFolder`. Missing directories are a no-op.
fn clear_folder(dir: &str) -> std::io::Result<()> {
    let p = Path::new(dir);
    if !p.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(p)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            std::fs::remove_dir_all(&path)?;
        } else {
            std::fs::remove_file(&path)?;
        }
    }
    Ok(())
}

/// Write `content` to `file_path`, creating parent directories as needed.
/// Mirrors `files.writeFile` (minus the delete-first step, which is
/// redundant because `fs::write` truncates).
fn write_file(file_path: &str, content: &str) -> std::io::Result<()> {
    let p = Path::new(file_path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(p, content)
}

/// Check whether the bundled code contains JSX syntax, mirroring
/// `utils.checks.isJsxContent`. We parse as TSX and walk for JSX nodes via
/// the oxc AST visitor.
fn is_jsx_content(code: &str) -> bool {
    use oxc::allocator::Allocator;
    use oxc::ast_visit::Visit;
    use oxc::parser::Parser;
    use oxc::span::SourceType;

    #[derive(Default)]
    struct JsxDetector {
        contains_jsx: bool,
    }

    impl<'a> Visit<'a> for JsxDetector {
        fn visit_jsx_element(&mut self, _it: &oxc::ast::ast::JSXElement<'a>) {
            self.contains_jsx = true;
        }

        fn visit_jsx_fragment(&mut self, _it: &oxc::ast::ast::JSXFragment<'a>) {
            self.contains_jsx = true;
        }
    }

    // Parse as TSX so JSX nodes are recognized.
    let source_type = SourceType::from_path(Path::new("file.tsx")).unwrap_or_default();
    let allocator = Allocator::default();
    let parser_return = Parser::new(&allocator, code, source_type).parse();
    let program = &parser_return.program;

    let mut detector = JsxDetector::default();
    detector.visit_program(program);
    detector.contains_jsx
}

/// Update `package.json` with export metadata, mirroring
/// `files.writePackageJson`. This builds the `exports`/`main`/`module`/
/// `types` fields from the collected [`OutFiles`] and re-emits the file
/// with the same field ordering as the TS port: `name`, `version`,
/// `description`, `type`, `main`, `types`, `module`, `exports`, then all
/// remaining ("rest") fields in their original order.
fn write_package_json(files: &OutFiles, export_path: &str) -> std::io::Result<()> {
    let pkg_path = PathBuf::from("package.json");
    let text = std::fs::read_to_string(&pkg_path)?;
    let root: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    let obj = root.as_object().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "package.json is not an object",
        )
    })?;

    let is_main = export_path == ".";
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    let rel = |p: &Option<String>| -> Option<String> {
        p.as_ref().map(|s| {
            let abs = Path::new(s);
            // If already relative, normalize; otherwise compute relative to cwd.
            if abs.is_absolute() {
                pathdiff(s, &cwd)
            } else {
                s.trim_start_matches("./").to_string()
            }
        })
    };

    // Known keys that are repositioned to the top of the object, matching
    // the explicit destructure + re-spread in the TS port.
    const LEADING_KEYS: &[&str] = &[
        "name",
        "version",
        "description",
        "main",
        "module",
        "type",
        "types",
        "exports",
    ];

    let take = |key: &str| -> Option<(String, serde_json::Value)> {
        obj.get(key).map(|v| (key.to_string(), v.clone()))
    };

    let name = take("name");
    let version = take("version");
    let description = take("description");
    let existing_main = obj.get("main").cloned();
    let existing_module = obj.get("module").cloned();
    let existing_types = obj.get("types").cloned();
    let existing_exports = obj.get("exports").cloned();

    // `type` is always forced to "module", matching the TS port.
    let type_val = serde_json::json!("module");

    // Resolve the effective main/module/types values.
    let (main_val, module_val, types_val) = if is_main {
        (
            rel(&files.main).map(serde_json::Value::String),
            rel(&files.module).map(serde_json::Value::String),
            rel(&files.types).map(serde_json::Value::String),
        )
    } else {
        (existing_main, existing_module, existing_types)
    };

    // Build/merge the `exports` field. For the main entry the TS port
    // replaces `exports` with just the new entry; for sub-paths it merges
    // the new entry into the existing `exports` object.
    let exports_val = {
        let mut exports_obj: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
        if !is_main {
            if let Some(existing) = &existing_exports {
                if let Some(m) = existing.as_object() {
                    exports_obj = m.clone();
                }
            }
        }
        if let Some(entry) = build_export_entry(files) {
            exports_obj.insert(export_path.to_string(), entry);
        }
        if exports_obj.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(exports_obj))
        }
    };

    // Assemble the output object in the exact TS port order:
    // name, version, description, type, ...main, ...types, ...module,
    // ...exports, ...rest.
    let mut out_obj: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    if let Some((k, v)) = name {
        out_obj.insert(k, v);
    }
    if let Some((k, v)) = version {
        out_obj.insert(k, v);
    }
    if let Some((k, v)) = description {
        out_obj.insert(k, v);
    }
    out_obj.insert("type".to_string(), type_val);
    if let Some(main) = main_val {
        out_obj.insert("main".to_string(), main);
    }
    if let Some(types) = types_val {
        out_obj.insert("types".to_string(), types);
    }
    if let Some(module) = module_val {
        out_obj.insert("module".to_string(), module);
    }
    if let Some(exports) = exports_val {
        out_obj.insert("exports".to_string(), exports);
    }

    // Append all remaining ("rest") fields in their original order, skipping
    // the leading keys we already repositioned.
    for (key, value) in obj.iter() {
        if LEADING_KEYS.contains(&key.as_str()) {
            continue;
        }
        out_obj.insert(key.clone(), value.clone());
    }

    let out = serde_json::to_string_pretty(&serde_json::Value::Object(out_obj))?;
    std::fs::write(&pkg_path, out)
}

/// Build the `exports` entry for a single export path, mirroring
/// `getExports` in `files.ts`.
fn build_export_entry(files: &OutFiles) -> Option<serde_json::Value> {
    let has_cjs = files.commonjs.is_some() && files.commonjs_types.is_some();
    let has_esm = files.esm.is_some() && files.esm_types.is_some();

    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let rel = |p: &Option<String>| -> String {
        let s = p.clone().unwrap_or_default();
        let abs = Path::new(&s);
        if abs.is_absolute() {
            pathdiff(&s, &cwd)
        } else {
            s.trim_start_matches("./").to_string()
        }
    };

    let mut entry = serde_json::Map::new();
    if has_esm {
        entry.insert(
            "import".to_string(),
            serde_json::json!({
                "types": format!("./{}", rel(&files.esm_types)),
                "default": format!("./{}", rel(&files.esm)),
            }),
        );
    }
    if has_cjs {
        entry.insert(
            "require".to_string(),
            serde_json::json!({
                "types": format!("./{}", rel(&files.commonjs_types)),
                "default": format!("./{}", rel(&files.commonjs)),
            }),
        );
    }
    if entry.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(entry))
    }
}

/// Compute `path` relative to `base`, returning a string with forward
/// slashes. A tiny stand-in for the `path` crate to avoid pulling a new
/// dependency.
fn pathdiff(p: &str, base: &Path) -> String {
    let target = Path::new(p);
    let mut result: Vec<String> = Vec::new();
    let mut base_components = base.components().collect::<Vec<_>>();
    let mut target_components = target.components().collect::<Vec<_>>();

    // Strip common prefix.
    while !base_components.is_empty()
        && !target_components.is_empty()
        && base_components[0] == target_components[0]
    {
        base_components.remove(0);
        target_components.remove(0);
    }

    for _ in &base_components {
        result.push("..".to_string());
    }
    for c in target_components {
        use std::path::Component::*;
        match c {
            Normal(s) => {
                result.push(s.to_string_lossy().to_string());
            }
            CurDir => {}
            ParentDir => result.push("..".to_string()),
            _ => {}
        }
    }
    result.join("/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::cli::CWD_TEST_MUTEX;
    use crate::core::config::{BuildEntryPoint, OutputFormat};

    #[test]
    fn join_path_basic() {
        assert_eq!(join_path("dist", "index.cjs"), "dist/index.cjs");
        assert_eq!(join_path("dist/sub", "index.mjs"), "dist/sub/index.mjs");
    }

    #[test]
    fn pathdiff_basic() {
        let cwd = PathBuf::from("/home/user/project");
        assert_eq!(
            pathdiff("/home/user/project/dist/index.cjs", &cwd),
            "dist/index.cjs"
        );
        assert_eq!(
            pathdiff("/home/user/project/dist/sub/index.mjs", &cwd),
            "dist/sub/index.mjs"
        );
    }

    #[test]
    fn is_jsx_content_detects_element() {
        assert!(is_jsx_content("const el = <div />;"));
        assert!(!is_jsx_content("const x = 1;"));
    }

    #[test]
    fn build_export_entry_both_formats() {
        let files = OutFiles {
            commonjs: Some("dist/index.cjs".to_string()),
            commonjs_types: Some("dist/index.d.cts".to_string()),
            esm: Some("dist/index.mjs".to_string()),
            esm_types: Some("dist/index.d.mts".to_string()),
            ..Default::default()
        };
        let entry = build_export_entry(&files).expect("entry");
        let obj = entry.as_object().unwrap();
        assert!(obj.contains_key("import"));
        assert!(obj.contains_key("require"));
    }

    #[test]
    fn build_export_entry_esm_only() {
        let files = OutFiles {
            esm: Some("dist/index.mjs".to_string()),
            esm_types: Some("dist/index.d.mts".to_string()),
            ..Default::default()
        };
        let entry = build_export_entry(&files).expect("entry");
        let obj = entry.as_object().unwrap();
        assert!(obj.contains_key("import"));
        assert!(!obj.contains_key("require"));
    }

    #[test]
    fn compiler_update_flag_reads_options() {
        let mut opts = BuildOptions::default();
        opts.update_package = true;
        let c = Compiler::new(opts);
        assert!(c.update());
    }

    #[test]
    fn entry_point_is_main() {
        let p = BuildEntryPoint {
            entry: "src/index.ts".to_string(),
            export_path: ".".to_string(),
            format: vec![OutputFormat::Esm],
            tsconfig_file_path: None,
            output_directory_path: "dist".to_string(),
            warning: false,
            plugins: Vec::new(),
        };
        assert!(p.is_main());
        let mut p2 = BuildEntryPoint::default();
        p2.export_path = "./sub".to_string();
        assert!(!p2.is_main());
    }

    fn seed_package_json(dir: &Path, json: &str) {
        std::fs::write(dir.join("package.json"), json).unwrap();
    }

    #[test]
    fn write_package_json_main_fields_and_order() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(tmp.path()).unwrap();

        seed_package_json(
            tmp.path(),
            r#"{"name":"pkg","version":"1.0.0","description":"d","sideEffects":false}"#,
        );

        let files = OutFiles {
            commonjs: Some("dist/index.cjs".to_string()),
            commonjs_types: Some("dist/index.d.cts".to_string()),
            esm: Some("dist/index.mjs".to_string()),
            esm_types: Some("dist/index.d.mts".to_string()),
            main: Some("dist/index.cjs".to_string()),
            module: Some("dist/index.mjs".to_string()),
            types: Some("dist/index.d.mts".to_string()),
            ..Default::default()
        };
        write_package_json(&files, ".").unwrap();

        let pkg: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string("package.json").unwrap()).unwrap();
        let obj = pkg.as_object().unwrap();
        // Field order must match the TS port: name, version, description,
        // type, main, types, module, exports, ...rest.
        let keys: Vec<&str> = obj.keys().map(|s| s.as_str()).collect();
        assert_eq!(
            keys,
            vec![
                "name",
                "version",
                "description",
                "type",
                "main",
                "types",
                "module",
                "exports",
                "sideEffects"
            ]
        );
        assert_eq!(pkg["type"], "module");
        assert_eq!(pkg["main"], "dist/index.cjs");
        assert_eq!(pkg["module"], "dist/index.mjs");
        assert_eq!(pkg["types"], "dist/index.d.mts");
        assert_eq!(pkg["sideEffects"], false);
        assert_eq!(pkg["exports"]["."]["import"]["types"], "./dist/index.d.mts");
        assert_eq!(pkg["exports"]["."]["import"]["default"], "./dist/index.mjs");
        assert_eq!(
            pkg["exports"]["."]["require"]["types"],
            "./dist/index.d.cts"
        );
        assert_eq!(
            pkg["exports"]["."]["require"]["default"],
            "./dist/index.cjs"
        );

        std::env::set_current_dir(prev).unwrap();
    }

    #[test]
    fn write_package_json_merges_subpath_exports() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(tmp.path()).unwrap();

        seed_package_json(
            tmp.path(),
            r#"{
                "name":"pkg","version":"1.0.0","description":"d",
                "main":"dist/root.cjs","module":"dist/root.mjs","types":"dist/root.d.ts",
                "exports":{".":{"import":{"types":"./dist/root.d.ts","default":"./dist/root.mjs"}}}
            }"#,
        );

        let files = OutFiles {
            commonjs: Some("dist/feature.cjs".to_string()),
            commonjs_types: Some("dist/feature.d.cts".to_string()),
            esm: Some("dist/feature.mjs".to_string()),
            esm_types: Some("dist/feature.d.mts".to_string()),
            main: None,
            module: None,
            types: None,
            ..Default::default()
        };
        write_package_json(&files, "./feature").unwrap();

        let pkg: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string("package.json").unwrap()).unwrap();
        // Root main/module/types must be preserved unchanged.
        assert_eq!(pkg["main"], "dist/root.cjs");
        assert_eq!(pkg["module"], "dist/root.mjs");
        assert_eq!(pkg["types"], "dist/root.d.ts");
        // Existing "." export preserved, new "./feature" merged in.
        assert_eq!(pkg["exports"]["."]["import"]["default"], "./dist/root.mjs");
        assert_eq!(
            pkg["exports"]["./feature"]["import"]["types"],
            "./dist/feature.d.mts"
        );
        assert_eq!(
            pkg["exports"]["./feature"]["require"]["default"],
            "./dist/feature.cjs"
        );

        std::env::set_current_dir(prev).unwrap();
    }
}
