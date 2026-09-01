//! Dependency-tree builder for the Susee bundler.
//!
//! This module is the top-level entry point for resolving a project's module
//! graph, classifying every file in the graph, and dispatching to the
//! appropriate module-type handler (ESM, CommonJS, CTS, or JSON).
//!
//! # Pipeline
//!
//! 1. [`get_deps`] builds the dependency [`generate_graph`], topologically
//!    sorts it, and reads every file's content/bytes into a [`DepsFile`].
//! 2. [`susee_tree`] inspects the collected [`DepsFile`] slice to determine
//!    the project's [`ProjectType`] (TS, JS, or MIXED), optionally runs the
//!    default/anonymous/default-export checks, and routes the files through
//!    the correct handler ([`cjs_handler`], [`cts_handler`], [`json_handler`]).
//!
//! Mixed ESM + CommonJS/CTS projects are rejected with an error because Susee
//! targets library packages only.

use super::cjs_handler::cjs_handler;
use super::cts_handler::cts_handler;
use super::json_handler::json_handler;
use crate::core::susee_deps::deps::checks::{
    run_check_opts_anonymous, run_check_opts_default_exports, run_default_check,
};
use crate::core::susee_deps::deps::graph::generate_graph;
use crate::core::susee_types::{
    DepReturns, DependenciesTree, DepsFile, ModuleType, ProjectType, ValidExts,
};
use crate::core::susee_utils::{detect_module_type, is_jsx_content, read_file};
use std::path::Path;
//

/// Builds and collects the dependency files for the given entry point.
///
/// This generates the dependency graph rooted at `entry` (resolved relative to
/// `root`), topologically sorts it, then reads each file's content and metadata
/// into a [`DepsFile`].
///
/// # Arguments
///
/// * `entry` - Path to the entry file, relative to `root`.
/// * `root`  - The project root used to resolve `entry` and all module specifiers.
///
/// # Returns
///
/// On success, a [`DepReturns`] containing the sorted `dep_files` plus the
/// collected `npm`, `nodes`, and `warns` vectors from the graph.
///
/// # Errors
///
/// Returns `std::io::Error` if a file in the graph cannot be read.
///
/// # Notes
///
/// Only the file whose full relative path equals `entry` is flagged with
/// `is_entry = true`. Comparing just the file name (e.g. "index.ts") would
/// incorrectly mark every same-named file as an entry.
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

/// Returns `true` if any file in `dep_files` is classified as ESM.
fn has_esm(dep_files: &[DepsFile]) -> bool {
    dep_files
        .iter()
        .any(|dep| dep.module_type == ModuleType::Esm)
}
/// Returns `true` if any file in `dep_files` is classified as CommonJS.
fn has_cjs(dep_files: &[DepsFile]) -> bool {
    dep_files
        .iter()
        .any(|dep| dep.module_type == ModuleType::Cjs)
}
/// Returns `true` if any file in `dep_files` is classified as CTS
/// (CommonJS in TypeScript).
fn has_cts(dep_files: &[DepsFile]) -> bool {
    dep_files
        .iter()
        .any(|dep| dep.module_type == ModuleType::Cts)
}
/// Returns `true` if any file in `dep_files` uses a TypeScript file
/// extension (`.ts`, `.tsx`, `.cts`, `.mts`).
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
/// Returns `true` if any file in `dep_files` uses a JavaScript file
/// extension (`.js`, `.jsx`, `.cjs`, `.mjs`).
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
/// Returns `true` if any file in `dep_files` is a JSON module.
fn has_json(dep_files: &[DepsFile]) -> bool {
    dep_files
        .iter()
        .any(|dep| dep.module_type == ModuleType::Json)
}

/// Resolves, classifies, and bundles the dependency tree rooted at `entry`.
///
/// This is the primary public entry point of the `susee_deps::deps::tree`
/// module. It performs the full pipeline:
///
/// 1. Collects and sorts the dependency graph via [`get_deps`].
/// 2. Runs the default dependency check ([`run_default_check`]).
/// 3. Optionally runs the default-exports check ([`run_check_opts_default_exports`])
///    when `check_default_exports` is `Some(true)`.
/// 4. Optionally runs the anonymous-exports check ([`run_check_opts_anonymous`])
///    when `check_anonymous` is `Some(true)`.
/// 5. Determines the [`ProjectType`] by inspecting file extensions and module
///    types, dispatching to the appropriate handler:
///    - **TS-only** projects → ESM (optionally JSON), or CTS via [`cts_handler`].
///    - **JS-only** projects → ESM (optionally JSON), or CommonJS via [`cjs_handler`].
///    - **Mixed** projects → ESM only; CommonJS/CTS combinations are rejected.
/// 6. JSON modules are post-processed through [`json_handler`] when present.
///
/// # Arguments
///
/// * `entry` - Path to the entry file, relative to `root`.
/// * `root` - The project root directory used to resolve module specifiers.
/// * `check_default_exports` - When `Some(true)`, enables the default-exports check.
/// * `check_anonymous` - When `Some(true)`, enables the anonymous-exports check.
///
/// # Errors
///
/// Propagates any [`std::io::Error`] from file reads during graph generation.
///
/// # Panics
///
/// Mixed ESM + CommonJS/CTS combinations are hard errors raised through
/// [`susee_log::error`](crate::core::susee_log::error) with `exit = true`,
/// which terminates the process.
///
/// # Examples
///
/// ```no_run
/// use susee_deps::deps::tree::susee_tree;
///
/// let tree = susee_tree("src/index.ts", "/my/project", None, None).unwrap();
/// assert_eq!(tree.project_type, susee_types::ProjectType::TS);
/// ```
pub fn susee_tree<P: AsRef<Path>>(
    entry: &str,
    root: P,
    check_default_exports: Option<bool>,
    check_anonymous: Option<bool>,
) -> std::io::Result<DependenciesTree> {
    let deps = get_deps(entry, root)?;
    let npm = deps.npm;
    let nodes = deps.nodes;
    let warns = deps.warns;
    let dep_files = deps.dep_files;
    let _ = run_default_check(dep_files.clone());

    let cdf = check_default_exports.unwrap_or(false);
    let ca = check_anonymous.unwrap_or(false);

    if cdf {
        run_check_opts_default_exports(dep_files.clone());
    }
    if ca {
        run_check_opts_anonymous(dep_files.clone());
    }

    if has_ts_extensions(&dep_files) && !has_js_extensions(&dep_files) {
        // 1. TS extensions only.
        // Both ESM and CTS (CommonJS in TypeScript) found
        if has_esm(&dep_files) && has_cts(&dep_files) {
            let info = "Susee is a bundler specialized for library packages; mixed module types are unsupported.";
            let cause =
                "Both ESM and CTS (CommonJS in TypeScript) were found in your dependency tree";
            let e = true;
            crate::core::susee_log::error(info, cause, e);
        }
        // Only CTS (CommonJS in TypeScript) found
        if !has_esm(&dep_files) && has_cts(&dep_files) {
            let message = "Bundling the CTS module type (CommonJS in TypeScript) is experimental; be careful with complex import/export.";
            crate::core::susee_log::warning(message);
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
            crate::core::susee_log::error(info, cause, e);
        }
        // Only CommonJS found
        if !has_esm(&dep_files) && has_cjs(&dep_files) {
            let message = "Bundling the CommonJS module type is experimental; be careful with complex import/export.";
            crate::core::susee_log::warning(message);
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
            crate::core::susee_log::error(info, cause, e);
        }
        if has_esm(&dep_files) && has_cjs(&dep_files) && has_cts(&dep_files) {
            let info = "Susee is a bundler specialized for library packages; mixed module types are unsupported.";
            let cause = "ESM, CommonJS, and CTS (CommonJS in TypeScript) were all found in your dependency tree";
            let e = true;
            crate::core::susee_log::error(info, cause, e);
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
}
