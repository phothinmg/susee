//! Find circular dependencies and build dependency chains via DFS.

use indexmap::IndexMap;
use std::collections::HashSet;

/// A circular dependency: the cycle chain and its type.
#[derive(Debug, Clone)]
pub struct CircularDependency {
    /// The cycle of dependencies, e.g. `["a", "b", "a"]`.
    pub chain: Vec<String>,
    /// Always `"circular"`.
    pub r#type: String,
}

/// Result of analyzing a dependency graph.
///
/// Produced by [`analyze_dependencies`]. Contains the list of detected
/// circular dependencies, per-file dependency chains, and entry-to-leaf chains.
#[derive(Debug, Clone)]
pub struct DependencyAnalysis {
    /// Circular dependency cycles found while traversing the graph.
    pub circular_dependencies: Vec<CircularDependency>,
    /// For each file, the full DFS path from a root down to (and including)
    /// that file.
    pub dependency_chains: IndexMap<String, Vec<String>>,
    /// Chains that start at an entry node and end at a leaf node.
    pub entry_to_leaf_chains: Vec<Vec<String>>,
}

/// Find circular dependencies in a dependency graph and build dependency chains.
///
/// Uses DFS to detect cycles and record entry-to-leaf chains.
pub fn analyze_dependencies(dep_obj: &IndexMap<String, Vec<String>>) -> DependencyAnalysis {
    let mut circular_dependencies: Vec<CircularDependency> = Vec::new();
    let mut dependency_chains: IndexMap<String, Vec<String>> = IndexMap::new();
    let mut visited: HashSet<String> = HashSet::new();
    let mut currently_visiting: HashSet<String> = HashSet::new();
    let mut entry_to_leaf_chains: Vec<Vec<String>> = Vec::new();

    #[allow(clippy::too_many_arguments)]
    fn dfs(
        current_file: &str,
        path: &[String],
        dep_obj: &IndexMap<String, Vec<String>>,
        circular_dependencies: &mut Vec<CircularDependency>,
        dependency_chains: &mut IndexMap<String, Vec<String>>,
        entry_to_leaf_chains: &mut Vec<Vec<String>>,
        visited: &mut HashSet<String>,
        currently_visiting: &mut HashSet<String>,
    ) {
        if currently_visiting.contains(current_file) {
            // Circular dependency found
            let cycle_start_index = path.iter().position(|p| p == current_file);
            if let Some(idx) = cycle_start_index {
                let cycle: Vec<String> = path[idx..].to_vec();
                let mut chain = cycle.clone();
                chain.push(current_file.to_string());
                circular_dependencies.push(CircularDependency {
                    chain,
                    r#type: "circular".to_string(),
                });
            }
            return;
        }

        if visited.contains(current_file) {
            return;
        }

        visited.insert(current_file.to_string());
        currently_visiting.insert(current_file.to_string());

        let mut current_path = path.to_vec();
        current_path.push(current_file.to_string());

        let dependencies = dep_obj.get(current_file).cloned().unwrap_or_default();

        if dependencies.is_empty() {
            // This is a leaf node
            entry_to_leaf_chains.push(current_path.clone());
        } else {
            for dep in &dependencies {
                dfs(
                    dep,
                    &current_path,
                    dep_obj,
                    circular_dependencies,
                    dependency_chains,
                    entry_to_leaf_chains,
                    visited,
                    currently_visiting,
                );
            }
        }

        // Store the complete dependency chain for this file
        dependency_chains.insert(current_file.to_string(), current_path);

        currently_visiting.remove(current_file);
    }

    // Analyze all files in the dependency graph (insertion order via IndexMap,
    // matching the TypeScript implementation's Object.keys iteration)
    for file in dep_obj.keys() {
        if !visited.contains(file) {
            dfs(
                file,
                &[],
                dep_obj,
                &mut circular_dependencies,
                &mut dependency_chains,
                &mut entry_to_leaf_chains,
                &mut visited,
                &mut currently_visiting,
            );
        }
    }

    // Remove duplicate circular dependencies (same chain string)
    let mut seen: HashSet<String> = HashSet::new();
    let unique_circular_deps: Vec<CircularDependency> = circular_dependencies
        .into_iter()
        .filter(|c| {
            let key = c.chain.join("->");
            seen.insert(key)
        })
        .collect();

    DependencyAnalysis {
        circular_dependencies: unique_circular_deps,
        dependency_chains,
        entry_to_leaf_chains,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map<I>(entries: I) -> IndexMap<String, Vec<String>>
    where
        I: IntoIterator<Item = (&'static str, Vec<&'static str>)>,
    {
        let mut m = IndexMap::new();
        for (k, v) in entries {
            m.insert(k.to_string(), v.into_iter().map(String::from).collect());
        }
        m
    }

    #[test]
    fn no_cycle_simple_chain() {
        let tree = map([("a", vec!["b"]), ("b", vec!["c"]), ("c", vec![])]);
        let analysis = analyze_dependencies(&tree);
        assert!(analysis.circular_dependencies.is_empty());
    }

    #[test]
    fn detects_two_node_cycle() {
        let tree = map([("a", vec!["b"]), ("b", vec!["a"])]);
        let analysis = analyze_dependencies(&tree);
        assert_eq!(analysis.circular_dependencies.len(), 1);
        let cd = &analysis.circular_dependencies[0];
        assert_eq!(cd.r#type, "circular");
        // chain starts and ends at the same node
        assert_eq!(cd.chain.first(), cd.chain.last());
        assert!(cd.chain.len() >= 3);
    }

    #[test]
    fn detects_self_cycle() {
        let tree = map([("a", vec!["a"])]);
        let analysis = analyze_dependencies(&tree);
        assert_eq!(analysis.circular_dependencies.len(), 1);
    }

    #[test]
    fn entry_to_leaf_chains_recorded() {
        let tree = map([("a", vec!["b"]), ("b", vec!["c"]), ("c", vec![])]);
        let analysis = analyze_dependencies(&tree);
        assert!(!analysis.entry_to_leaf_chains.is_empty());
        // one leaf -> one chain
        let chain = &analysis.entry_to_leaf_chains[0];
        assert_eq!(chain.first(), Some(&"a".to_string()));
        assert_eq!(chain.last(), Some(&"c".to_string()));
    }

    #[test]
    fn dependency_chains_cover_all_nodes() {
        let tree = map([("a", vec!["b"]), ("b", vec![])]);
        let analysis = analyze_dependencies(&tree);
        assert!(analysis.dependency_chains.contains_key("a"));
        assert!(analysis.dependency_chains.contains_key("b"));
    }

    #[test]
    fn empty_graph() {
        let tree = IndexMap::new();
        let analysis = analyze_dependencies(&tree);
        assert!(analysis.circular_dependencies.is_empty());
        assert!(analysis.entry_to_leaf_chains.is_empty());
        assert!(analysis.dependency_chains.is_empty());
    }

    #[test]
    fn duplicate_cycles_deduplicated() {
        // a -> b -> c -> b  (single cycle b<->c reachable from a)
        let tree = map([("a", vec!["b"]), ("b", vec!["c"]), ("c", vec!["b"])]);
        let analysis = analyze_dependencies(&tree);
        // Only one distinct cycle should be reported.
        assert_eq!(analysis.circular_dependencies.len(), 1);
    }
}
