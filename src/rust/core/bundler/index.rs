//! Bundler entry point.
//!
//! Ported from `src/nodejs/bundler/index.ts`.
//!
//! The [`bundler`] function:
//! 1. Generates the dependency tree via [`crate::dependencies::generate_dependencies`].
//! 2. Resolves JSON modules.
//! 3. Handles `export default` renaming.
//! 4. Handles anonymous exports/imports.
//! 5. Removes imports and exports from dependency files.
//! 6. Merges removed import statements.
//! 7. Merges all content into a single bundled string.
//! 8. Cleans unused code.

use std::path::Path;
use std::time::Instant;

use crate::core::dependensa::generate_dependencies;
use crate::core::dependensa::{DepsFile, ModuleType};
use crate::core::plugins::{
    DependencyPayload, Plugin, PluginContext, PreProcessPayload, dispatch_dependencies,
    dispatch_pre_process,
};

use super::anonymous::anonymous_handler;
use super::export_default::export_default_handler;
use super::helpers::{codegen_program, is_json, with_parsed_program};
use super::remove::{remove_exports, remove_imports};
use super::resolve_json::json_module_handlers;
use super::unused_code::{ClearUnusedOptions, clean_unused_code};

/// Log a profiling phase if `SUSEE_PROFILE` env var is set.
fn log_bundler_phase(entry: &str, phase: &str, start: Instant) {
    if std::env::var("SUSEE_PROFILE").is_ok_and(|v| v == "1" || v == "true") {
        let elapsed = start.elapsed();
        let ms = elapsed.as_secs_f64() * 1000.0;
        let basename = Path::new(entry)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(entry);
        eprintln!("[SUSEE_PROFILE][bundler:{basename}] {phase}: {ms:.1}ms");
    }
}

/// Bundle a TypeScript/JavaScript project starting from `entry`.
///
/// This is the Rust equivalent of the `bundler` function from `index.ts`.
///
/// # Arguments
/// * `entry` — The entry file path (relative to `root`).
/// * `root` — The project root directory.
/// * `plugins` — Plugins to dispatch at the `dependency` and `pre-process`
///   stages. Pass `&[]` for no plugins.
///
/// # Returns
/// The bundled source code as a single string.
pub fn bundler<P: AsRef<Path>>(
    entry: &str,
    root: P,
    plugins: &[Box<dyn Plugin>],
) -> std::io::Result<String> {
    let bundler_start = Instant::now();
    let mut removed_statements: Vec<String> = Vec::new();

    // 0. Generate the dependency tree.
    let phase_start = Instant::now();
    let tree = generate_dependencies(entry, &root)?;
    log_bundler_phase(entry, "generateDependencies", phase_start);

    // Check for warnings.
    if !tree.warns.is_empty() {
        eprintln!("{}", tree.warns.join("\n"));
    }

    // 1. Resolve JSON Modules
    let has_json = is_json(&tree);
    let mut deps_files = tree.dep_files;
    if has_json {
        let phase_start = Instant::now();
        deps_files = json_module_handlers(deps_files)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        log_bundler_phase(entry, "resolveJSON", phase_start);
    }

    // 1.5. Dependency plugins — run after JSON resolution and before the
    //      CommonJS check, mirroring step 2 in `bundler/index.ts`. This is
    //      the "tree(ast) plugin" hook from the project notes.
    if !plugins.is_empty() {
        let phase_start = Instant::now();
        let scope = format!(
            "bundler:{}",
            Path::new(entry)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(entry)
        );
        let ctx = PluginContext::for_bundler(&tree.entry);
        let payload = DependencyPayload { deps_files };
        let payload = dispatch_dependencies(plugins, &ctx, payload, &scope)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        deps_files = payload.deps_files;
        log_bundler_phase(entry, "dependencyPlugins", phase_start);
    }

    // 2. Check for CommonJS modules
    let has_commonjs = deps_files.iter().any(|f| f.module_type == ModuleType::Cjs);
    if has_commonjs {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Bundler found commonjs module/modules in dependencies tree. \
             Please use \"@suseejs/commonjs-plugin\" to solve it.",
        ));
    }

    // 3. Handling Export Default
    let phase_start = Instant::now();
    deps_files = export_default_handler(deps_files);
    log_bundler_phase(entry, "exportDefault", phase_start);

    // 4. Handling Anonymous Imports/Exports
    let phase_start = Instant::now();
    deps_files = anonymous_handler(deps_files);
    log_bundler_phase(entry, "anonymous", phase_start);

    // 5. Handling Remove Imports/Exports
    let phase_start = Instant::now();

    // 5.1 Remove Imports — apply to all files
    let mut updated_files = Vec::with_capacity(deps_files.len());
    for dep in &deps_files {
        let new_content = remove_imports(&dep.file, &dep.content, &mut removed_statements);
        updated_files.push(DepsFile {
            file: dep.file.clone(),
            content: new_content,
            bytes: dep.bytes,
            module_type: dep.module_type,
            file_ext: dep.file_ext,
            is_jsx: dep.is_jsx,
            is_entry: dep.is_entry,
        });
    }
    deps_files = updated_files;

    // 5.2 Remove Exports — apply to dependency files only (not the entry file)
    let mut final_files = Vec::with_capacity(deps_files.len());
    for dep in &deps_files {
        if dep.is_entry {
            final_files.push(dep.clone());
        } else {
            let new_content = remove_exports(&dep.file, &dep.content);
            final_files.push(DepsFile {
                file: dep.file.clone(),
                content: new_content,
                bytes: dep.bytes,
                module_type: dep.module_type,
                file_ext: dep.file_ext,
                is_jsx: dep.is_jsx,
                is_entry: dep.is_entry,
            });
        }
    }
    deps_files = final_files;
    log_bundler_phase(entry, "removeImportsExports", phase_start);

    // 6. Handling Imported Statements
    let phase_start = Instant::now();
    // Filter removed statements that are NOT local (don't start with ./ or ../)
    removed_statements.retain(|s| is_non_local_import(s));
    removed_statements = merge_imports_statement(&removed_statements);
    let import_statements = removed_statements.join("\n").trim().to_string();
    log_bundler_phase(entry, "mergeImports", phase_start);

    // 7. Merge all content from the dependency tree
    let phase_start = Instant::now();

    // 7.1 Merge dependency files content (all except the last = entry file)
    let (dep_files_content, main_file_content) = merge_content(&deps_files);

    // 7.2 Merge all into one — imports at top, then deps, then entry
    let mut content = format!("{import_statements}\n{dep_files_content}\n{main_file_content}");

    // Remove ";" that remain after removing imports
    content = content
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty() || !line.starts_with(';'))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    log_bundler_phase(entry, "mergeContent", phase_start);

    // 8. Clean unused code
    let phase_start = Instant::now();
    content = clean_unused_code(&content, &tree.entry, ClearUnusedOptions::default());
    log_bundler_phase(entry, "cleanUnusedCode", phase_start);

    // 9. Pretty-print the final bundle using oxc's codegen so the output
    // is formatted with consistent indentation, matching the TS bundler's
    // printer output.
    let phase_start = Instant::now();
    content = with_parsed_program(&tree.entry, &content, codegen_program);
    log_bundler_phase(entry, "prettyPrint", phase_start);

    // 10. Pre-process plugins — run on the final bundled content before
    //     returning, mirroring step 10 in `bundler/index.ts`.
    if !plugins.is_empty() {
        let phase_start = Instant::now();
        let scope = format!(
            "bundler:{}",
            Path::new(entry)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(entry)
        );
        let ctx = PluginContext::for_bundler(&tree.entry);
        let payload = PreProcessPayload { content };
        let payload = dispatch_pre_process(plugins, &ctx, payload, &scope)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        content = payload.content;
        log_bundler_phase(entry, "preProcessPlugins", phase_start);
    }

    log_bundler_phase(entry, "total", bundler_start);

    Ok(content)
}

/// Merge content from dependency files.
///
/// Returns (dep_files_content, main_file_content) where the main file is
/// the last file in the list (the entry file).
fn merge_content(deps_files: &[DepsFile]) -> (String, String) {
    let cwd = std::env::current_dir().unwrap_or_default();

    // Dep files = all except the last (entry file)
    let dep_content: Vec<String> = deps_files
        .split_at(deps_files.len().saturating_sub(1))
        .0
        .iter()
        .map(|dep| {
            let file = format!("//{}", path_relative(&cwd, Path::new(&dep.file)));
            format!("{file}\n{}", dep.content)
        })
        .collect();

    // Main file = the last file (entry file)
    let main_content: Vec<String> = deps_files
        .split_at(deps_files.len().saturating_sub(1))
        .1
        .iter()
        .map(|dep| {
            let file = format!("//{}", path_relative(&cwd, Path::new(&dep.file)));
            format!("{file}\n{}", dep.content)
        })
        .collect();

    let dep_content = dep_content.join("\n").trim().to_string();
    let main_content = main_content.join("\n").trim().to_string();

    (dep_content, main_content)
}

/// Compute a path relative to `base`, using `/` as separator.
fn path_relative(base: &Path, abs: &Path) -> String {
    abs.strip_prefix(base)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| abs.to_string_lossy().replace('\\', "/"))
}

/// Merge import statements by combining imports from the same module.
///
/// Ported from `utils.gen.mergeImportsStatement` in `utilities.ts`.
fn merge_imports_statement(imports: &[String]) -> Vec<String> {
    use std::collections::BTreeMap;

    let mut import_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut type_import_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut default_imports: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut type_default_imports: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut namespace_imports: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for import_str in imports {
        // Parse: import [type] [clause] from "module";
        let import_str_trimmed = import_str.trim();

        // Extract module path
        let module_match = extract_module_path(import_str_trimmed);
        let Some(module_path) = module_match else {
            continue;
        };

        let is_type_import = import_str_trimmed.contains("import type");

        // Extract import clause (between `import [type]` and `from`)
        let clause = extract_import_clause(import_str_trimmed, &module_path, is_type_import);

        match &clause {
            None => {
                // Default import or side-effect import: `import Foo from "module"`
                if let Some(name) = extract_default_name(import_str_trimmed, is_type_import) {
                    let target_map = if is_type_import {
                        &mut type_default_imports
                    } else {
                        &mut default_imports
                    };
                    let entry = target_map.entry(module_path.clone()).or_default();
                    if !entry.contains(&name) {
                        entry.push(name);
                    }
                }
            }
            Some(clause) => {
                if clause.starts_with('{') {
                    // Named imports: `import { a, b } from "module"`
                    let names: Vec<String> = clause
                        .trim_matches(|c| c == '{' || c == '}')
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();

                    let target_map = if is_type_import {
                        &mut type_import_map
                    } else {
                        &mut import_map
                    };
                    let entry = target_map.entry(module_path.clone()).or_default();
                    for name in names {
                        if !entry.contains(&name) {
                            entry.push(name);
                        }
                    }
                } else if clause.starts_with("* as") {
                    // Namespace import: `import * as name from "module"`
                    if let Some(name) = clause.strip_prefix("* as").map(|s| s.trim().to_string()) {
                        let entry = namespace_imports.entry(module_path.clone()).or_default();
                        if !entry.contains(&name) {
                            entry.push(name);
                        }
                    }
                } else {
                    // Default import: `import name from "module"`
                    let target_map = if is_type_import {
                        &mut type_default_imports
                    } else {
                        &mut default_imports
                    };
                    let entry = target_map.entry(module_path.clone()).or_default();
                    let name = clause.trim().to_string();
                    if !entry.contains(&name) {
                        entry.push(name);
                    }
                }
            }
        }
    }

    let mut merged: Vec<String> = Vec::new();

    // Process named imports
    for (module_path, regular_names) in &import_map {
        let type_names = type_import_map.get(module_path);
        let mut final_names: Vec<String> = regular_names.clone();

        if let Some(type_names) = type_names {
            for type_name in type_names {
                if !regular_names.contains(type_name) && !final_names.contains(type_name) {
                    final_names.push(type_name.clone());
                }
            }
        }

        if !final_names.is_empty() {
            final_names.sort();
            let import_names = final_names.join(", ");
            merged.push(format!(
                "import {{ {import_names} }} from \"{module_path}\";"
            ));
        }
    }

    // Add remaining type-only named imports
    for (module_path, type_names) in &type_import_map {
        if !import_map.contains_key(module_path) && !type_names.is_empty() {
            let mut names = type_names.clone();
            names.sort();
            let import_names = names.join(", ");
            merged.push(format!(
                "import type {{ {import_names} }} from \"{module_path}\";"
            ));
        }
    }

    // Process default imports
    for (module_path, regular_names) in &default_imports {
        let type_default_names = type_default_imports.get(module_path);
        let mut final_names: Vec<String> = regular_names.clone();

        if let Some(type_default_names) = type_default_names {
            for type_name in type_default_names {
                if !regular_names.contains(type_name) && !final_names.contains(type_name) {
                    final_names.push(type_name.clone());
                }
            }
        }

        if !final_names.is_empty() {
            let import_names = final_names.join(", ");
            merged.push(format!("import {import_names} from \"{module_path}\";"));
        }
    }

    // Add remaining type-only default imports
    for (module_path, type_default_names) in &type_default_imports {
        if !default_imports.contains_key(module_path) && !type_default_names.is_empty() {
            let import_names = type_default_names.join(", ");
            merged.push(format!(
                "import type {import_names} from \"{module_path}\";"
            ));
        }
    }

    // Process namespace imports
    for (module_path, names) in &namespace_imports {
        if !names.is_empty() {
            let import_names = names.join(", ");
            merged.push(format!(
                "import * as {import_names} from \"{module_path}\";"
            ));
        }
    }

    merged.sort();
    merged
}

/// Check if an import statement is a non-local import (not from ./ or ../).
fn is_non_local_import(s: &str) -> bool {
    let trimmed = s.trim_start();
    if !trimmed.starts_with("import") {
        return false;
    }
    // Find the string literal (module specifier)
    // Look for " or ' after `from` or directly after `import`
    let module_spec = extract_string_literal(trimmed);
    match module_spec {
        Some(spec) => !spec.starts_with("./") && !spec.starts_with("../"),
        None => false,
    }
}

/// Extract the first string literal from a string.
fn extract_string_literal(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'"' || c == b'\'' {
            let quote = c;
            let start = i + 1;
            i += 1;
            while i < bytes.len() && bytes[i] != quote {
                i += 1;
            }
            if i < bytes.len() {
                return Some(s[start..i].to_string());
            }
        }
        i += 1;
    }
    None
}

/// Extract the module path from an import statement.
fn extract_module_path(import_str: &str) -> Option<String> {
    extract_string_literal(import_str)
}

/// Extract the import clause from an import statement.
fn extract_import_clause(import_str: &str, _module_path: &str, is_type: bool) -> Option<String> {
    // Remove `import` and optionally `type`
    let after_import = if is_type {
        import_str.strip_prefix("import type")?.trim()
    } else {
        import_str.strip_prefix("import")?.trim()
    };

    // Find ` from ` to split clause from module specifier
    let from_pos = after_import
        .find(" from ")
        .or_else(|| after_import.find("\tfrom "));
    if let Some(pos) = from_pos {
        let clause = after_import[..pos].trim();
        if clause.is_empty() {
            return None;
        }
        return Some(clause.to_string());
    }

    // No `from` — it's a side-effect import: `import "module"`
    None
}

/// Extract the default import name from a simple `import Foo from "module"`.
fn extract_default_name(import_str: &str, is_type: bool) -> Option<String> {
    let after_import = if is_type {
        import_str.strip_prefix("import type")?.trim()
    } else {
        import_str.strip_prefix("import")?.trim()
    };

    // The name is the first word before `from`
    let from_pos = after_import.find(" from ")?;
    let before_from = after_import[..from_pos].trim();
    if before_from.is_empty() {
        return None;
    }
    Some(before_from.to_string())
}

/// Bundle a TypeScript/JavaScript project starting from `entry`.
///
/// Convenience wrapper around [`bundler`] that uses the current directory
/// as the project root and no plugins.
pub fn bundle(entry: &str) -> std::io::Result<String> {
    bundler(entry, ".", &[])
}
