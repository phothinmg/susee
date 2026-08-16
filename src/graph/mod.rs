//! Dependensia - A static analysis tool for TypeScript/JavaScript projects.
//!
//! Examines TS/JS projects and produces dependency graphs.
//!
//! Ported from the original TypeScript implementation in `deps/`.

// The graph module exposes a public API surface (structs, fields, and methods)
// intended for library consumers. Not every field/method is exercised by the
// current binary entry point, so suppress dead-code warnings for the whole
// module rather than annotating each item individually.
#![allow(dead_code)]

pub mod analyze;
pub mod collect;
pub mod handlers;
pub mod leaf;
pub mod mutual;
pub mod package_info;
pub mod resolve_ext;
pub mod sort;
pub mod utils;
pub mod visualize;

use std::path::{Path, PathBuf};

use analyze::{CircularDependency, DependencyAnalysis, analyze_dependencies};
use collect::{CollectedDepsInfo, collect_dependencies};
use leaf::find_leaf_files;
use mutual::find_mutual_dependencies;
use package_info::get_package_info;
use sort::topo_sort;
use utils::{create_graph, merge_string_arr};
use visualize::visualize_dependencies;

/// Result of analyzing a project's dependencies.
///
/// Each method returns a different view of the dependency graph.
pub struct Dependensia {
    root: PathBuf,
    sorted_graph: Vec<String>,
    npm_modules: Vec<String>,
    node_modules: Vec<String>,
    deps_obj: std::collections::BTreeMap<String, Vec<String>>,
    warning: Vec<String>,
    mutual_files: Vec<Vec<String>>,
    leaves: Vec<String>,
    analyzed_data: DependencyAnalysis,
    text: String,
}

impl Dependensia {
    /// Topological sort of the dependency graph (DAG).
    pub fn sort(&self) -> &[String] {
        &self.sorted_graph
    }

    /// The list of NPM dependencies.
    pub fn npm(&self) -> &[String] {
        &self.npm_modules
    }

    /// The list of Node.js built-in module dependencies.
    pub fn node(&self) -> &[String] {
        &self.node_modules
    }

    /// The dependency graph: file -> list of files it depends on.
    pub fn deps(&self) -> &std::collections::BTreeMap<String, Vec<String>> {
        &self.deps_obj
    }

    /// The collection of warnings.
    pub fn warn(&self) -> &[String] {
        &self.warning
    }

    /// Files that depend on each other mutually (two-way circular dependencies).
    pub fn mutual(&self) -> &[Vec<String>] {
        &self.mutual_files
    }

    /// Leaf files (files that don't import any other local files).
    pub fn leaf(&self) -> &[String] {
        &self.leaves
    }

    /// Circular dependencies found in the graph.
    pub fn circular(&self) -> &[CircularDependency] {
        &self.analyzed_data.circular_dependencies
    }

    /// Files that depend on the given file.
    pub fn dependents(&self, file: &str) -> Vec<String> {
        let rel = path_relative(&self.root, Path::new(file));
        if let Some(chain) = self.analyzed_data.dependency_chains.get(&rel) {
            // Return all but the last element (which is the file itself)
            if chain.len() > 1 {
                return chain[..chain.len() - 1].to_vec();
            }
        }
        Vec::new()
    }

    /// The dependency chain of the graph.
    pub fn chain(&self) -> &std::collections::BTreeMap<String, Vec<String>> {
        &self.analyzed_data.dependency_chains
    }

    /// Entry-to-leaf dependency chains.
    pub fn entry_to_leaf(&self) -> &[Vec<String>] {
        &self.analyzed_data.entry_to_leaf_chains
    }

    /// The dependency graph as text.
    pub fn text_graph(&self) -> &str {
        &self.text
    }
}

/// Analyze a TypeScript/JavaScript project's dependencies.
///
/// `entry` is the entry file to start analyzing from, relative to `root`.
/// `root` is the project root directory (defaults to current directory).
pub fn dependensia<P: AsRef<Path>>(entry: &str, root: P) -> std::io::Result<Dependensia> {
    let root = root.as_ref().to_path_buf();
    let pkg = get_package_info(&root);
    let collected: CollectedDepsInfo = collect_dependencies(entry, &pkg, &root);

    let npm_modules = merge_string_arr(&collected.collected_npm_modules);
    let node_modules = merge_string_arr(&collected.collected_node_modules);
    let warning = merge_string_arr(&collected.collected_warning);

    let deps_obj = create_graph(&collected.dependencies, &root);
    let sorted_graph = topo_sort(&deps_obj);
    let mutual_files = find_mutual_dependencies(&deps_obj);
    let leaves = find_leaf_files(&deps_obj);
    let text = visualize_dependencies(&deps_obj);
    let analyzed_data = analyze_dependencies(&deps_obj);

    Ok(Dependensia {
        root,
        sorted_graph,
        npm_modules,
        node_modules,
        deps_obj,
        warning,
        mutual_files,
        leaves,
        analyzed_data,
        text,
    })
}

/// Compute a path relative to `root`, using `/` as separator (like Node.js).
fn path_relative(root: &Path, file: &Path) -> String {
    file.strip_prefix(root)
        .unwrap_or(file)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Convenience wrapper: analyze using the current directory as root.
pub fn dependensia_cwd(entry: &str) -> std::io::Result<Dependensia> {
    let root = std::env::current_dir()?;
    dependensia(entry, root)
}
