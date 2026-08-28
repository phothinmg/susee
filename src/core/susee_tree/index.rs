use super::cjs_handler::cjs_handler;
use super::cts_handler::cts_handler;
use super::types::{DependenciesTree, DepsFile, ModuleType, ProjectType, ValidExts};
use super::utils::{detect_module_type, is_jsx_content, read_file};
use crate::core::susee_log;
use colored::*;
use dependensa::generate_graph;
use std::path::Path;
//
#[derive(serde::Serialize)]
struct DepReturns {
    pub npm: Vec<String>,
    pub nodes: Vec<String>,
    pub warns: Vec<String>,
    pub dep_files: Vec<DepsFile>,
}

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

        let (content, bytes) = match read_file(&root, &file) {
            Ok(c) => c,
            Err(e) => {
                // Mirror the TS version which exits on missing files; here we
                // surface the error to the caller.
                return Err(e);
            }
        };

        let module_type = detect_module_type(&content, path);
        let is_jsx = is_jsx_content(&content, path);
        let is_entry = is_entry_file(&file);
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
/// Tree for bundler
pub fn susee_tree<P: AsRef<Path>>(entry: &str, root: P) -> std::io::Result<DependenciesTree> {
    let deps = get_deps(entry, root).expect(&"Error generating dependency files".magenta());
    let npm = deps.npm;
    let nodes = deps.nodes;
    let warns = deps.warns;
    let dep_files = deps.dep_files;

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
            return Ok(DependenciesTree {
                entry: entry.to_string(),
                npm,
                nodes,
                warns,
                dep_files: cts_handled,
                project_type: ProjectType::TS,
            });
        }
        // Only ESM found
        return Ok(DependenciesTree {
            entry: entry.to_string(),
            npm,
            nodes,
            warns,
            dep_files,
            project_type: ProjectType::TS,
        });
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
            return Ok(DependenciesTree {
                entry: entry.to_string(),
                npm,
                nodes,
                warns,
                dep_files: cjs_handled,
                project_type: ProjectType::JS,
            });
        }
        // Only ESM found
        return Ok(DependenciesTree {
            entry: entry.to_string(),
            npm,
            nodes,
            warns,
            dep_files,
            project_type: ProjectType::JS,
        });
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
        return Ok(DependenciesTree {
            entry: entry.to_string(),
            npm,
            nodes,
            warns,
            dep_files,
            project_type: ProjectType::MIXED,
        });
    }
}
