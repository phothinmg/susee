use super::cjs_handler::cjs_handler;
use super::cts_handler::cts_handler;
use super::json_handler::json_handler;
use crate::core::susee_check::check_and_exit;
use crate::core::susee_log;
use crate::core::susee_types::{
    DepReturns, DependenciesTree, DepsFile, ModuleType, ProjectType, ValidExts,
};
use crate::core::susee_utils::{detect_module_type, is_jsx_content, read_file};
use dependensa::generate_graph;
use std::path::Path;
//

fn get_deps<P: AsRef<Path>>(entry: &str, root: P) -> std::io::Result<DepReturns> {
    let root = root.as_ref().to_path_buf();

    // 1. Build and sort the dependency graph.
    let graph = generate_graph(entry, &root)?;
    let sorted = graph.sort();
    let npm = graph.npm().to_vec();
    let nodes = graph.node().to_vec();
    let warns = graph.warn().to_vec();

    // Compare full relative paths, not just file names, so that only the
    // actual entry file is marked as `is_entry`. Using just the file name
    // (e.g. "index.ts") would match every `index.ts` in the project.
    let entry_normalized = entry.replace('\\', "/");
    let is_entry_file = |file: &str| file.replace('\\', "/") == entry_normalized;

    let mut dep_files: Vec<DepsFile> = Vec::with_capacity(sorted.len());
    for file in sorted {
        let path = Path::new(&file);
        let file_ext_str = path.extension().and_then(|e| e.to_str()).unwrap_or("");

        let (content, bytes) = match read_file(&root, file) {
            Ok(c) => c,
            Err(e) => {
                // Mirror the TS version which exits on missing files; here we
                // surface the error to the caller.
                return Err(e);
            }
        };

        let module_type = detect_module_type(&content, path);
        let is_jsx = is_jsx_content(&content, path);
        let is_entry = is_entry_file(file);
        let file_ext = ValidExts::from_path_ext(file_ext_str).unwrap_or(ValidExts::Ts);

        dep_files.push(DepsFile {
            file: file.clone(),
            content,
            bytes,
            module_type,
            file_ext,
            is_jsx,
            is_entry,
        });
    }

    Ok(DepReturns {
        npm,
        nodes,
        warns,
        dep_files,
    })
}

fn has_esm(dep_files: &[DepsFile]) -> bool {
    dep_files
        .iter()
        .any(|dep| dep.module_type == ModuleType::Esm)
}
fn has_cjs(dep_files: &[DepsFile]) -> bool {
    dep_files
        .iter()
        .any(|dep| dep.module_type == ModuleType::Cjs)
}
fn has_cts(dep_files: &[DepsFile]) -> bool {
    dep_files
        .iter()
        .any(|dep| dep.module_type == ModuleType::Cts)
}
fn has_ts_extensions(dep_files: &[DepsFile]) -> bool {
    let ts_extensions = [
        ValidExts::Ts,
        ValidExts::Tsx,
        ValidExts::Cts,
        ValidExts::Mts,
    ];
    dep_files
        .iter()
        .any(|dep| ts_extensions.contains(&dep.file_ext))
}
fn has_js_extensions(dep_files: &[DepsFile]) -> bool {
    let js_extensions = [
        ValidExts::Js,
        ValidExts::Jsx,
        ValidExts::Cjs,
        ValidExts::Mjs,
    ];
    dep_files
        .iter()
        .any(|dep| js_extensions.contains(&dep.file_ext))
}
fn has_json(dep_files: &[DepsFile]) -> bool {
    dep_files
        .iter()
        .any(|dep| dep.module_type == ModuleType::Json)
}
/// Tree for bundler
pub fn susee_tree<P: AsRef<Path>>(
    entry: &str,
    root: P,
    check: bool,
) -> std::io::Result<DependenciesTree> {
    let deps = get_deps(entry, root)?;
    let npm = deps.npm;
    let nodes = deps.nodes;
    let warns = deps.warns;
    let dep_files = deps.dep_files;
    if check {
        check_and_exit(dep_files.clone());
    }

    if has_ts_extensions(&dep_files) && !has_js_extensions(&dep_files) {
        // 1. TS extensions only.
        // Both ESM and CTS (CommonJS in TypeScript) found
        if has_esm(&dep_files) && has_cts(&dep_files) {
            let info = "Susee is a bundler specialized for library packages; mixed module types are unsupported.";
            let cause =
                "Both ESM and CTS (CommonJS in TypeScript) were found in your dependency tree";
            let e = true;
            susee_log::error(info, cause, e);
        }
        // Only CTS (CommonJS in TypeScript) found
        if !has_esm(&dep_files) && has_cts(&dep_files) {
            let message = "Bundling the CTS module type (CommonJS in TypeScript) is experimental; be careful with complex import/export.";
            susee_log::warning(message);
            let cts_handled = cts_handler(dep_files);
            let dep_files = if has_json(&cts_handled) {
                json_handler(cts_handled)
            } else {
                cts_handled
            };
            return Ok(DependenciesTree {
                entry: entry.to_string(),
                npm,
                nodes,
                warns,
                dep_files,
                project_type: ProjectType::TS,
            });
        }
        // Only ESM found
        let dep_files = if has_json(&dep_files) {
            json_handler(dep_files)
        } else {
            dep_files
        };
        Ok(DependenciesTree {
            entry: entry.to_string(),
            npm,
            nodes,
            warns,
            dep_files,
            project_type: ProjectType::TS,
        })
    } else if !has_ts_extensions(&dep_files) && has_js_extensions(&dep_files) {
        // 2. JS extensions only.
        // Both ESM and CommonJS found
        if has_esm(&dep_files) && has_cjs(&dep_files) {
            let info = "Susee is a bundler specialized for library packages; mixed module types are unsupported.";
            let cause = "Both ESM and CommonJS were found in your dependency tree";
            let e = true;
            susee_log::error(info, cause, e);
        }
        // Only CommonJS found
        if !has_esm(&dep_files) && has_cjs(&dep_files) {
            let message = "Bundling the CommonJS module type is experimental; be careful with complex import/export.";
            susee_log::warning(message);
            let cjs_handled = cjs_handler(dep_files);
            let dep_files = if has_json(&cjs_handled) {
                json_handler(cjs_handled)
            } else {
                cjs_handled
            };
            return Ok(DependenciesTree {
                entry: entry.to_string(),
                npm,
                nodes,
                warns,
                dep_files,
                project_type: ProjectType::JS,
            });
        }
        // Only ESM found
        let dep_files = if has_json(&dep_files) {
            json_handler(dep_files)
        } else {
            dep_files
        };
        Ok(DependenciesTree {
            entry: entry.to_string(),
            npm,
            nodes,
            warns,
            dep_files,
            project_type: ProjectType::JS,
        })
    } else {
        // 3. Both extensions.
        if has_esm(&dep_files) && (has_cjs(&dep_files) || has_cts(&dep_files)) {
            let info = "Susee is a bundler specialized for library packages; mixed module types are unsupported.";
            let cause = "Both ESM and CommonJS or CTS (CommonJS in TypeScript) were found in your dependency tree";
            let e = true;
            susee_log::error(info, cause, e);
        }
        if has_esm(&dep_files) && has_cjs(&dep_files) && has_cts(&dep_files) {
            let info = "Susee is a bundler specialized for library packages; mixed module types are unsupported.";
            let cause = "ESM, CommonJS, and CTS (CommonJS in TypeScript) were all found in your dependency tree";
            let e = true;
            susee_log::error(info, cause, e);
        }
        // Only ESM found
        let dep_files = if has_json(&dep_files) {
            json_handler(dep_files)
        } else {
            dep_files
        };
        Ok(DependenciesTree {
            entry: entry.to_string(),
            npm,
            nodes,
            warns,
            dep_files,
            project_type: ProjectType::MIXED,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_dep(file: &str, mt: ModuleType, ext: ValidExts) -> DepsFile {
        DepsFile {
            file: file.to_string(),
            content: "export const x = 1;".to_string(),
            bytes: 20,
            module_type: mt,
            file_ext: ext,
            is_jsx: false,
            is_entry: false,
        }
    }

    // -----------------------------------------------------------------------
    // has_esm / has_cjs / has_cts
    // -----------------------------------------------------------------------

    #[test]
    fn has_esm_detects_esm_file() {
        let deps = vec![make_dep("a.ts", ModuleType::Esm, ValidExts::Ts)];
        assert!(has_esm(&deps));
    }

    #[test]
    fn has_esm_false_without_esm() {
        let deps = vec![make_dep("a.cjs", ModuleType::Cjs, ValidExts::Cjs)];
        assert!(!has_esm(&deps));
    }

    #[test]
    fn has_cjs_detects_cjs_file() {
        let deps = vec![make_dep("a.cjs", ModuleType::Cjs, ValidExts::Cjs)];
        assert!(has_cjs(&deps));
    }

    #[test]
    fn has_cjs_false_without_cjs() {
        let deps = vec![make_dep("a.ts", ModuleType::Esm, ValidExts::Ts)];
        assert!(!has_cjs(&deps));
    }

    #[test]
    fn has_cts_detects_cts_file() {
        let deps = vec![make_dep("a.cts", ModuleType::Cts, ValidExts::Cts)];
        assert!(has_cts(&deps));
    }

    #[test]
    fn has_cts_false_without_cts() {
        let deps = vec![make_dep("a.ts", ModuleType::Esm, ValidExts::Ts)];
        assert!(!has_cts(&deps));
    }

    // -----------------------------------------------------------------------
    // has_ts_extensions / has_js_extensions
    // -----------------------------------------------------------------------

    #[test]
    fn has_ts_extensions_detects_ts() {
        let deps = vec![make_dep("a.ts", ModuleType::Esm, ValidExts::Ts)];
        assert!(has_ts_extensions(&deps));
    }

    #[test]
    fn has_ts_extensions_detects_tsx() {
        let deps = vec![make_dep("a.tsx", ModuleType::Esm, ValidExts::Tsx)];
        assert!(has_ts_extensions(&deps));
    }

    #[test]
    fn has_ts_extensions_detects_cts() {
        let deps = vec![make_dep("a.cts", ModuleType::Cts, ValidExts::Cts)];
        assert!(has_ts_extensions(&deps));
    }

    #[test]
    fn has_ts_extensions_false_for_js() {
        let deps = vec![make_dep("a.js", ModuleType::Esm, ValidExts::Js)];
        assert!(!has_ts_extensions(&deps));
    }

    #[test]
    fn has_js_extensions_detects_js() {
        let deps = vec![make_dep("a.js", ModuleType::Esm, ValidExts::Js)];
        assert!(has_js_extensions(&deps));
    }

    #[test]
    fn has_js_extensions_detects_cjs() {
        let deps = vec![make_dep("a.cjs", ModuleType::Cjs, ValidExts::Cjs)];
        assert!(has_js_extensions(&deps));
    }

    #[test]
    fn has_js_extensions_false_for_ts() {
        let deps = vec![make_dep("a.ts", ModuleType::Esm, ValidExts::Ts)];
        assert!(!has_js_extensions(&deps));
    }

    // -----------------------------------------------------------------------
    // has_json
    // -----------------------------------------------------------------------

    #[test]
    fn has_json_detects_json_module() {
        let deps = vec![make_dep("a.json", ModuleType::Json, ValidExts::Json)];
        assert!(has_json(&deps));
    }

    #[test]
    fn has_json_false_without_json() {
        let deps = vec![make_dep("a.ts", ModuleType::Esm, ValidExts::Ts)];
        assert!(!has_json(&deps));
    }

    // -----------------------------------------------------------------------
    // susee_tree integration
    // -----------------------------------------------------------------------

    #[test]
    fn susee_tree_returns_err_for_missing_entry() {
        let dir = tempfile::tempdir().unwrap();
        let result = susee_tree("nonexistent.ts", dir.path(), false);
        assert!(result.is_err());
    }

    #[test]
    fn susee_tree_builds_ts_project() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.ts"), "export const x = 1;").unwrap();
        let result = susee_tree("index.ts", dir.path(), false).unwrap();
        assert_eq!(result.project_type, ProjectType::TS);
        assert_eq!(result.entry, "index.ts");
        assert!(!result.dep_files.is_empty());
    }
}
