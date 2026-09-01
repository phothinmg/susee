//! Dependency graph construction, analysis, and visualization.
//!
//! This module ties together the full pipeline used to inspect a project's
//! import graph: collecting source files, resolving their dependencies,
//! detecting cycles and mutual dependencies, identifying leaf files, and
//! producing a topological ordering suitable for downstream tooling.
//!
//! The central entry point is [`generate_graph`], which returns a
//! [`DependencyGraph`] that exposes several derived views of the analyzed
//! project (topological order, NPM packages, circular dependencies, etc.).

/// Dependency cycle detection and analysis.
mod analyze;
/// Verification that collected npm dependencies are actually installed.
mod check_installed;
/// Collection of dependency information from project source files.
mod collect;
/// Event handlers used while traversing and building the dependency graph.
mod handlers;
/// Identification of leaf files (files with no further local dependencies).
mod leaf;
/// Detection of mutual (bidirectional) dependencies between files.
mod mutual;
/// Extraction of metadata from `package.json` manifests.
mod package_info;
/// Resolution of external (non-local) module specifiers.
mod resolve_ext;
/// Topological sorting of files based on their dependency relationships.
mod sort;
/// Shared graph construction and array-merging helpers.
mod utils;
/// Rendering of the dependency graph into human-readable output formats.
mod visualize;

use indexmap::IndexMap;
use std::path::{Path, PathBuf};

use analyze::{CircularDependency, DependencyAnalysis, analyze_dependencies};
use check_installed::check_npm_installed;
use collect::{CollectedDepsInfo, collect_dependencies};
use leaf::find_leaf_files;
use mutual::find_mutual_dependencies;
use package_info::get_package_info;
use sort::topo_sort;
use utils::{create_graph, merge_string_arr};
use visualize::visualize_dependencies;

/// Result of analyzing a project's dependencies.
///
/// Produced by [`generate_graph`], this type holds the fully traversed
/// dependency graph of a project along with multiple derived views computed
/// during analysis. Each accessor method returns a different slice of the
/// graph:
///
/// | Method | View |
/// |--------|------|
/// | [`sort`] | Topologically sorted files (dependencies first) |
/// | [`npm`] | NPM package specifiers (e.g. `"react"`) |
/// | [`node`] | Node.js built-in module specifiers (e.g. `"node:fs"`) |
/// | [`deps`] | The raw dependency map: file → its local imports |
/// | [`warn`] | Warnings collected during traversal |
/// | [`mutual`] | Pairs of files that depend on each other |
/// | [`leaf`] | Files with no local-file dependencies |
/// | [`circular`] | Circular dependency chains detected |
/// | [`dependents`] | Files that depend on a given file |
/// | [`chain`] | Full dependency chains for every file |
/// | [`entry_to_leaf`] | Paths from the entry file to each leaf |
/// | [`text_graph`] | The graph rendered as a text tree |
///
/// [`sort`]: GraphObject::sort
/// [`npm`]: GraphObject::npm
/// [`node`]: GraphObject::node
/// [`deps`]: GraphObject::deps
/// [`warn`]: GraphObject::warn
/// [`mutual`]: GraphObject::mutual
/// [`leaf`]: GraphObject::leaf
/// [`circular`]: GraphObject::circular
/// [`dependents`]: GraphObject::dependents
/// [`chain`]: GraphObject::chain
/// [`entry_to_leaf`]: GraphObject::entry_to_leaf
/// [`text_graph`]: GraphObject::text_graph
///
/// # Serialization
///
/// `GraphObject` implements [`serde::Serialize`] so the full graph can be
/// serialized to JSON. The internal [`DependencyAnalysis`] data is skipped
/// during serialization and is only accessible via the accessor methods.
///
/// # Example
///
/// ```no_run
/// use susee_deps::{generate_graph, GraphObject};
///
/// let graph: GraphObject = generate_graph("index.ts", ".").unwrap();
/// println!("{}", graph.text_graph());
/// ```
#[derive(serde::Serialize)]
pub struct GraphObject {
    /// The project root directory (canonicalized).
    root: PathBuf,
    /// Topologically sorted graph (dependencies first).
    sorted_graph: Vec<String>,
    /// NPM dependency specifiers.
    npm_modules: Vec<String>,
    /// Node.js built-in module specifiers.
    node_modules: Vec<String>,
    /// The dependency graph: file -> list of files it depends on.
    deps_obj: IndexMap<String, Vec<String>>,
    /// Warnings collected during traversal.
    warning: Vec<String>,
    /// Mutually-dependent file pairs.
    mutual_files: Vec<Vec<String>>,
    /// Leaf files (no local-file dependencies).
    leaves: Vec<String>,
    /// Raw analysis data (not serialized).
    #[serde(skip)]
    analyzed_data: DependencyAnalysis,
    /// The dependency graph rendered as a text tree.
    text: String,
}

impl GraphObject {
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
    pub fn deps(&self) -> &IndexMap<String, Vec<String>> {
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
    pub fn chain(&self) -> &IndexMap<String, Vec<String>> {
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

/// Analyze the dependency graph of a project.
///
/// Starting from `entry`, this function recursively resolves and collects all
/// local-file imports, NPM module specifiers, and Node.js built-in module
/// specifiers to build a complete dependency graph of the project rooted at
/// `root`.
///
/// # Arguments
///
/// * `entry` — The entry file path (relative to `root`, e.g. `"index.ts"`).
///   This is the starting point from which dependencies are traversed.
/// * `root` — The project root directory. May be absolute or relative. If
///   relative, it is resolved against the current working directory so that
///   all derived file paths are absolute. This mirrors Node.js's
///   `process.cwd()` behavior.
///
/// # Returns
///
/// A [`GraphObject`] containing multiple views of the dependency graph:
///
/// * Topological sort ([`GraphObject::sort`])
/// * NPM module specifiers ([`GraphObject::npm`])
/// * Node.js built-in modules ([`GraphObject::node`])
/// * The raw dependency map ([`GraphObject::deps`])
/// * Warnings collected during traversal ([`GraphObject::warn`])
/// * Mutually-dependent file pairs ([`GraphObject::mutual`])
/// * Leaf files with no local imports ([`GraphObject::leaf`])
/// * Circular dependencies ([`GraphObject::circular`])
/// * Dependency chains ([`GraphObject::chain`], [`GraphObject::entry_to_leaf`])
/// * A text-tree rendering ([`GraphObject::text_graph`])
///
/// # Errors
///
/// Returns an error if reading or resolving files fails during traversal.
///
/// # Example
///
/// ```no_run
/// use susee_deps::generate_graph;
///
/// let graph = generate_graph("index.ts", ".").unwrap();
/// for file in graph.leaf() {
///     println!("leaf: {file}");
/// }
/// ```
pub fn generate_graph<P: AsRef<Path>>(entry: &str, root: P) -> std::io::Result<GraphObject> {
    // Canonicalize `root` to an absolute path so that all derived file paths
    // are absolute too. This mirrors the TS version's `process.cwd()` and
    // avoids `resolve_extension` failures on relative paths (e.g. when a
    // single-component relative path like `package.json` yields an empty
    // parent directory that `read_dir` cannot open).
    let root = if root.as_ref().is_absolute() {
        root.as_ref().to_path_buf()
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(root.as_ref()))
            .unwrap_or_else(|_| root.as_ref().to_path_buf())
    };
    let pkg = get_package_info(&root);
    let collected: CollectedDepsInfo = collect_dependencies(entry, &pkg, &root);

    let npm_modules = merge_string_arr(&collected.collected_npm_modules);
    let node_modules = merge_string_arr(&collected.collected_node_modules);
    let warning = merge_string_arr(&collected.collected_warning);

    // Verify that every collected npm specifier is actually installed
    // (listed in package.json or present in node_modules). If any are
    // missing, `check_npm_installed` logs an error and exits the process,
    // so the `Err` arm is unreachable.
    let _ = check_npm_installed(&npm_modules, &pkg, &root);

    let deps_obj = create_graph(&collected.dependencies, &root);
    let sorted_graph = topo_sort(&deps_obj);
    let mutual_files = find_mutual_dependencies(&deps_obj);
    let leaves = find_leaf_files(&deps_obj);
    let text = visualize_dependencies(&deps_obj);
    let analyzed_data = analyze_dependencies(&deps_obj);

    Ok(GraphObject {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn path_relative_strips_root_and_normalizes_separators() {
        let root = Path::new("/root");
        let file = Path::new("/root/src/a.ts");
        assert_eq!(path_relative(root, file), "src/a.ts");
    }

    #[test]
    fn path_relative_without_prefix_returns_as_is() {
        let root = Path::new("/root");
        let file = Path::new("/other/a.ts");
        assert_eq!(path_relative(root, file), "/other/a.ts");
    }

    fn write_pkg(root: &Path, json: &str) {
        fs::write(root.join("package.json"), json).unwrap();
    }

    #[test]
    fn graph_simple_project() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{"type":"module","dependencies":{}}"#);
        fs::write(
            root.join("index.ts"),
            "import { b } from './b';\nimport * as fs from 'node:fs';\n",
        )
        .unwrap();
        fs::write(root.join("b.ts"), "export const b = 1;\n").unwrap();

        let deps = generate_graph("index.ts", root).unwrap();
        // sorted graph contains both files
        assert_eq!(deps.sort().len(), 2);
        // b is a leaf (no local imports)
        assert!(deps.leaf().contains(&"b.ts".to_string()));
        // node:fs detected
        assert!(deps.node().iter().any(|m| m == "node:fs"));
        // no circular deps
        assert!(deps.circular().is_empty());
        // text graph is non-empty
        assert!(!deps.text_graph().is_empty());
    }

    #[test]
    fn graph_detects_mutual_and_circular() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{}"#);
        fs::write(root.join("a.ts"), "import { b } from './b';\n").unwrap();
        fs::write(root.join("b.ts"), "import { a } from './a';\n").unwrap();

        let deps = generate_graph("a.ts", root).unwrap();
        assert!(!deps.mutual().is_empty());
        assert!(!deps.circular().is_empty());
    }

    #[test]
    fn graph_serializes_to_json() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{}"#);
        fs::write(root.join("index.ts"), "export const x = 1;\n").unwrap();

        let deps = generate_graph("index.ts", root).unwrap();
        let json = serde_json::to_string(&deps).unwrap();
        assert!(json.contains("sorted_graph"));
        assert!(!json.contains("analyzed_data")); // skipped
    }

    #[test]
    fn graph_dependents_returns_chain() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{}"#);
        fs::write(root.join("a.ts"), "import { b } from './b';\n").unwrap();
        fs::write(root.join("b.ts"), "export const b = 1;\n").unwrap();

        let deps = generate_graph("a.ts", root).unwrap();
        let dependents = deps.dependents("b.ts");
        assert!(dependents.contains(&"a.ts".to_string()));
    }
}
