//! Find leaf files (files that don't import any other local files).
//!
//! Ported from `deps/lib/leaf.ts`.

use indexmap::IndexMap;

use super::utils::is_node_builtin_module;

/// Find leaf files — files with no local-file dependencies.
///
/// A file is a leaf when none of its recorded dependencies are local files.
/// npm modules and Node.js built-in modules are ignored, so a file that only
/// imports `react` / `node:fs` still counts as a leaf.
pub fn find_leaf_files(dep_obj: &IndexMap<String, Vec<String>>) -> Vec<String> {
    dep_obj
        .iter()
        .filter(|(_, deps)| {
            let local_deps = deps.iter().filter(|dep| {
                dep.starts_with('.')
                    || (!dep.contains("node_modules") && !is_node_builtin_module(dep))
            });
            local_deps.count() == 0
        })
        .map(|(file, _)| file.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::indexmap;

    #[test]
    fn no_local_deps_is_leaf() {
        let graph = indexmap! {
            "a".to_string() => vec![],
        };
        assert_eq!(find_leaf_files(&graph), vec!["a"]);
    }

    #[test]
    fn ignores_node_builtins() {
        let graph = indexmap! {
            "a".to_string() => vec!["node:fs".to_string(), "path".to_string()],
        };
        assert_eq!(find_leaf_files(&graph), vec!["a"]);
    }

    #[test]
    fn ignores_npm_modules() {
        // `react` is not a node builtin and doesn't contain "node_modules",
        // so per the filter it counts as a local dependency — `a` is NOT a leaf.
        let graph = indexmap! {
            "a".to_string() => vec!["react".to_string()],
        };
        let leaves = find_leaf_files(&graph);
        assert!(leaves.is_empty());
    }

    #[test]
    fn local_dep_not_leaf() {
        let graph = indexmap! {
            "a".to_string() => vec!["./b".to_string()],
            "b".to_string() => vec![],
        };
        let leaves = find_leaf_files(&graph);
        assert!(leaves.contains(&"b".to_string()));
        assert!(!leaves.contains(&"a".to_string()));
    }

    #[test]
    fn mixed_local_and_external_not_leaf() {
        let graph = indexmap! {
            "a".to_string() => vec!["./b".to_string(), "react".to_string(), "node:fs".to_string()],
            "b".to_string() => vec![],
        };
        let leaves = find_leaf_files(&graph);
        assert_eq!(leaves, vec!["b"]);
    }

    #[test]
    fn empty_graph_no_leaves() {
        let graph = IndexMap::new();
        assert!(find_leaf_files(&graph).is_empty());
    }
}
