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

use indexmap::IndexMap;
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

/// Analyze a TypeScript/JavaScript project's dependencies.
///
/// `entry` is the entry file to start analyzing from, relative to `root`.
/// `root` is the project root directory (defaults to current directory).
///
/// # Examples
///
/// Analyze a project starting from `src/index.ts` in the current directory:
///
/// ```no_run
/// use GraphObject::generate_graph;
///
/// let deps = generate_graph("src/index.ts", ".")?;
///
/// // Files in topological order (dependencies first)
/// for file in deps.sort() {
///     println!("{}", file);
/// }
///
/// // Print each circular dependency cycle
/// for cycle in deps.circular() {
///     println!("cycle: {:?}", cycle.chain);
/// }
///
/// // Render the full graph as a text tree
/// print!("{}", deps.text_graph());
/// # Ok::<(), std::io::Error>(())
/// ```
///
/// Use [`generate_graph_cwd`] when you want to analyze the current directory without
/// passing an explicit `root`:
///
/// ```no_run
/// use GraphObject::generate_graph_cwd;
///
/// let deps = generate_graph_cwd("src/index.ts")?;
/// # Ok::<(), std::io::Error>(())
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

/// Convenience wrapper: analyze using the current directory as root.
///
/// # Examples
///
/// ```no_run
/// use GraphObject::generate_graph_cwd;
///
/// let deps = generate_graph_cwd("src/index.ts")?;
///
/// // List files that have no local-file imports
/// for leaf in deps.leaf() {
///     println!("leaf: {}", leaf);
/// }
///
/// // Serialize the whole result to JSON (implements `serde::Serialize`)
/// let json = serde_json::to_string_pretty(&deps)?;
/// println!("{}", json);
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub fn generate_graph_cwd(entry: &str) -> std::io::Result<GraphObject> {
    let root = std::env::current_dir()?;
    generate_graph(entry, root)
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
