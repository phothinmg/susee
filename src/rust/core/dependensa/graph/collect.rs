//! Recursively traverse files and collect local, node builtin, and npm dependencies.
//!
//! Ported from `deps/lib/collect.ts`. Instead of the TypeScript compiler API,
//! this uses the oxc parser (via [`super::parse::collect_module_specifiers`]).

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::handlers::collect_module_specifiers;
use super::package_info::PackageInfo;
use super::resolve_ext::resolve_extension;
use super::utils::{CollectedObject, is_node_builtin_module};

/// Aggregated result of collecting dependencies from an entry file.
///
/// Returned by [`collect_dependencies`]. The vectors are parallel: each inner
/// vector corresponds to the file at the same position in
/// [`CollectState::dependencies`].
#[derive(Debug, Clone)]
pub struct CollectedDepsInfo {
    /// One [`CollectedObject`](super::utils::CollectedObject) per visited file.
    pub dependencies: Vec<CollectedObject>,
    /// Per-file npm module specifiers (parallel to `dependencies`).
    pub collected_npm_modules: Vec<Vec<String>>,
    /// Per-file Node.js built-in module specifiers.
    pub collected_node_modules: Vec<Vec<String>>,
    /// Per-file unresolved/unrecognized specifiers (warnings).
    pub collected_warning: Vec<Vec<String>>,
}

/// Recursively traverse `entry` and its dependencies to collect
/// local, node builtin, and npm dependencies.
///
/// `entry` is relative to `root`.
pub fn collect_dependencies(entry: &str, pkg: &PackageInfo, root: &Path) -> CollectedDepsInfo {
    let mut state = CollectState {
        dependencies: Vec::new(),
        visited: HashSet::new(),
        collected_npm_modules: Vec::new(),
        collected_node_modules: Vec::new(),
        collected_warning: Vec::new(),
        root: root.to_path_buf(),
        pkg: pkg.clone(),
    };
    state.visit(entry, 0);
    CollectedDepsInfo {
        dependencies: state.dependencies,
        collected_npm_modules: state.collected_npm_modules,
        collected_node_modules: state.collected_node_modules,
        collected_warning: state.collected_warning,
    }
}

struct CollectState {
    dependencies: Vec<CollectedObject>,
    visited: HashSet<PathBuf>,
    collected_npm_modules: Vec<Vec<String>>,
    collected_node_modules: Vec<Vec<String>>,
    collected_warning: Vec<Vec<String>>,
    root: PathBuf,
    pkg: PackageInfo,
}

impl CollectState {
    fn visit(&mut self, file: &str, index: usize) {
        let abs_path = normalize_path(&self.root.join(file));
        let abs_key = abs_path.clone();
        if self.visited.contains(&abs_key) {
            return;
        }
        self.visited.insert(abs_key);

        let checked_abs_path = match resolve_extension(&abs_path) {
            Ok(r) => r.result,
            Err(msg) => {
                // Could not resolve: record warning and empty deps
                self.dependencies.push(CollectedObject {
                    file: abs_path.to_string_lossy().into_owned(),
                    index,
                    import_files: Vec::new(),
                });
                self.collected_warning.push(vec![msg]);
                return;
            }
        };

        if !checked_abs_path.exists() {
            self.dependencies.push(CollectedObject {
                file: abs_path.to_string_lossy().into_owned(),
                index,
                import_files: Vec::new(),
            });
            self.collected_warning.push(vec![format!(
                "File not found: {}",
                checked_abs_path.display()
            )]);
            return;
        }

        let content = match fs::read_to_string(&checked_abs_path) {
            Ok(c) => c,
            Err(e) => {
                self.dependencies.push(CollectedObject {
                    file: abs_path.to_string_lossy().into_owned(),
                    index,
                    import_files: Vec::new(),
                });
                self.collected_warning.push(vec![format!(
                    "Cannot read {}: {e}",
                    checked_abs_path.display()
                )]);
                return;
            }
        };

        let module_texts = collect_module_specifiers(&content, &checked_abs_path);

        let mut import_files: Vec<String> = Vec::new();
        let mut warn: Vec<String> = Vec::new();
        let mut npm_modules: Vec<String> = Vec::new();
        let mut node_modules: Vec<String> = Vec::new();

        for module_text in &module_texts {
            process_module(
                module_text,
                &checked_abs_path,
                &self.root,
                &self.pkg,
                &mut import_files,
                &mut node_modules,
                &mut npm_modules,
                &mut warn,
            );
        }

        self.dependencies.push(CollectedObject {
            file: abs_path.to_string_lossy().into_owned(),
            index,
            import_files: import_files.clone(),
        });
        self.collected_npm_modules.push(npm_modules);
        self.collected_node_modules.push(node_modules);
        self.collected_warning.push(warn);

        // Recursively visit local file dependencies.
        let next_index = self.dependencies.len();
        // Take ownership of import_files to avoid double borrow
        let deps_to_visit = import_files.clone();
        for dep_file in deps_to_visit {
            self.visit(&dep_file, next_index);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn process_module(
    module_text: &str,
    checked_abs_path: &Path,
    root: &Path,
    pkg: &PackageInfo,
    import_files: &mut Vec<String>,
    node_modules: &mut Vec<String>,
    npm_modules: &mut Vec<String>,
    warn: &mut Vec<String>,
) {
    // Local relative import
    if module_text.starts_with('.') {
        let resolved_module_path = normalize_path(
            &checked_abs_path
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join(module_text),
        );

        let rel_import = match resolve_extension(&resolved_module_path) {
            Ok(r) => path_relative(root, &r.result),
            Err(_) => {
                // Fallback: treat as file with extension
                path_relative(root, &resolved_module_path)
            }
        };
        import_files.push(rel_import);
    } else if is_node_builtin_module(module_text) {
        // Recognize both bare (`fs`) and `node:`-prefixed (`node:fs`) builtins.
        node_modules.push(module_text.to_string());
    } else if pkg.contains(module_text) {
        npm_modules.push(module_text.to_string());
    } else {
        warn.push(module_text.to_string());
    }
}

/// Compute a path relative to `root`, using `/` as separator (like Node.js).
fn path_relative(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| abs.to_string_lossy().replace('\\', "/"))
}

/// Normalize a path by collapsing `.` and `..` components.
///
/// Rust's `Path::join` does not normalize path components the way Node.js's
/// `path.resolve` does. Without this, joining `parent` with a specifier like
/// `./bundler/../dependencies/../helpers/files.ts` leaves the `.` and `..`
/// segments intact, producing paths such as
/// `node_src/./bundler/../dependencies/../helpers/files.ts`.
///
/// This performs pure lexical normalization (no filesystem access), mirroring
/// Node.js `path.resolve` semantics for already-absolute paths.
fn normalize_path(p: &Path) -> PathBuf {
    use std::path::Component;

    let mut out: Vec<Component> = Vec::new();
    for comp in p.components() {
        match comp {
            Component::CurDir => { /* skip `.` */ }
            Component::ParentDir => {
                // Pop the last normal component if possible; `..` that can't
                // be resolved (e.g. at root) is kept.
                match out.last() {
                    Some(Component::Normal(_)) => {
                        out.pop();
                    }
                    Some(Component::RootDir) | Some(Component::Prefix(_)) => { /* at root, drop `..` */
                    }
                    None => out.push(comp),
                    Some(_) => out.push(comp),
                }
            }
            other => out.push(other),
        }
    }

    let mut buf = PathBuf::new();
    for comp in &out {
        buf.push(comp.as_os_str());
    }
    buf
}

#[cfg(test)]
mod tests {
    use crate::core::dependensa::graph;
    use crate::core::dependensa::graph::PathBuf;
    use crate::core::dependensa::graph::collect::normalize_path;
    use crate::core::dependensa::graph::collect_dependencies;
    use crate::core::dependensa::graph::get_package_info;
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    #[test]
    fn normalize_path_collapses_dots() {
        let p = normalize_path(Path::new("/root/a/./b/../c.ts"));
        assert_eq!(p, PathBuf::from("/root/a/c.ts"));
    }

    #[test]
    fn normalize_path_relative_parent() {
        let p = normalize_path(Path::new("a/b/../c.ts"));
        assert_eq!(p, PathBuf::from("a/c.ts"));
    }

    #[test]
    fn normalize_path_root_parent_kept() {
        // `..` at root is dropped
        let p = normalize_path(Path::new("/.."));
        assert_eq!(p, PathBuf::from("/"));
    }

    #[test]
    fn collect_visits_entry_and_deps() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        fs::write(
            root.join("a.ts"),
            "import { b } from './b';\nimport * as fs from 'node:fs';\n",
        )
        .unwrap();
        fs::write(root.join("b.ts"), "export const b = 1;\n").unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"type":"module","dependencies":{}}"#,
        )
        .unwrap();

        let pkg = graph::get_package_info(root);
        let info = collect_dependencies("a.ts", &pkg, root);

        // two files visited: a.ts and b.ts
        assert_eq!(info.dependencies.len(), 2);
        // a.ts imports b (local) and node:fs (builtin)
        let node_mods: Vec<String> = info
            .collected_node_modules
            .iter()
            .flatten()
            .cloned()
            .collect();
        assert!(node_mods.iter().any(|m| m == "node:fs"));
    }

    #[test]
    fn collect_missing_entry_records_warning() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("package.json"), r#"{}"#).unwrap();

        let pkg = get_package_info(root);
        let info = collect_dependencies("nonexistent.ts", &pkg, root);

        assert_eq!(info.dependencies.len(), 1);
        assert!(info.collected_warning.iter().any(|w| !w.is_empty()));
        assert!(info.dependencies[0].import_files.is_empty());
    }

    #[test]
    fn collect_npm_modules_recorded() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("a.ts"), "import React from 'react';\n").unwrap();
        fs::write(
            root.join("package.json"),
            r#"{"dependencies":{"react":"^18.0.0"}}"#,
        )
        .unwrap();

        let pkg = get_package_info(root);
        let info = collect_dependencies("a.ts", &pkg, root);

        let npm: Vec<String> = info
            .collected_npm_modules
            .iter()
            .flatten()
            .cloned()
            .collect();
        assert!(npm.iter().any(|m| m == "react"));
    }

    #[test]
    fn collect_warning_for_unknown_external() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::write(
            root.join("a.ts"),
            "import foo from 'some-unknown-package';\n",
        )
        .unwrap();
        fs::write(root.join("package.json"), r#"{}"#).unwrap();

        let pkg = get_package_info(root);
        let info = collect_dependencies("a.ts", &pkg, root);

        let warns: Vec<String> = info.collected_warning.iter().flatten().cloned().collect();
        assert!(warns.iter().any(|w| w == "some-unknown-package"));
    }
}
