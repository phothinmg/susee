//! Topological sort of a directed acyclic graph (DAG).

use indexmap::IndexMap;
use std::collections::{HashSet, VecDeque};

/// Topological sort of a dependency graph.
///
/// `tree` maps each node to the list of nodes it depends on.
/// Returns nodes in topological order (dependencies first).
///
/// Uses insertion order (via `IndexMap`) to match the TypeScript
/// implementation, which iterates `Object.keys(tree)`.
pub fn topo_sort(tree: &IndexMap<String, Vec<String>>) -> Vec<String> {
    let mut visited: HashSet<String> = HashSet::new();
    let mut sorted: Vec<String> = Vec::new();

    fn visit(
        node: &str,
        tree: &IndexMap<String, Vec<String>>,
        visited: &mut HashSet<String>,
        sorted: &mut Vec<String>,
    ) {
        if visited.contains(node) {
            return;
        }
        visited.insert(node.to_string());
        if let Some(deps) = tree.get(node) {
            for dep in deps {
                visit(dep, tree, visited, sorted);
            }
        }
        sorted.push(node.to_string());
    }

    for node in tree.keys() {
        visit(node, tree, &mut visited, &mut sorted);
    }

    sorted
}

/// Iterative topological sort using Kahn's algorithm (BFS).
///
/// This is a non-recursive alternative that also detects cycles. Kept as a
/// utility for consumers that prefer BFS ordering. Nodes that participate in a
/// cycle are omitted from the result (they never reach in-degree zero).
#[allow(dead_code)]
pub fn topo_sort_kahn(tree: &IndexMap<String, Vec<String>>) -> Vec<String> {
    // Build in-degree map and adjacency list
    let mut in_degree: IndexMap<String, usize> = IndexMap::new();
    for node in tree.keys() {
        in_degree.entry(node.clone()).or_insert(0);
    }
    for deps in tree.values() {
        for dep in deps {
            *in_degree.entry(dep.clone()).or_insert(0) += 1;
        }
    }

    let mut queue: VecDeque<String> = in_degree
        .iter()
        .filter(|(_, deg)| **deg == 0)
        .map(|(k, _)| k.clone())
        .collect();

    let mut result: Vec<String> = Vec::new();
    while let Some(node) = queue.pop_front() {
        result.push(node.clone());
        if let Some(deps) = tree.get(&node) {
            for dep in deps {
                if let Some(deg) = in_degree.get_mut(dep) {
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(dep.clone());
                    }
                }
            }
        }
    }

    result
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
    fn empty_graph() {
        let tree = IndexMap::new();
        assert!(topo_sort(&tree).is_empty());
    }

    #[test]
    fn single_node_no_deps() {
        let tree = map([("a", vec![])]);
        assert_eq!(topo_sort(&tree), vec!["a"]);
    }

    #[test]
    fn linear_chain_deps_first() {
        // a -> b -> c   (a depends on b, b depends on c)
        let tree = map([("a", vec!["b"]), ("b", vec!["c"]), ("c", vec![])]);
        let sorted = topo_sort(&tree);
        let pa = sorted.iter().position(|s| s == "a").unwrap();
        let pb = sorted.iter().position(|s| s == "b").unwrap();
        let pc = sorted.iter().position(|s| s == "c").unwrap();
        assert!(pc < pb && pb < pa, "deps must come first: {sorted:?}");
    }

    #[test]
    fn diamond_deps_first() {
        // a -> b, a -> c, b -> d, c -> d
        let tree = map([
            ("a", vec!["b", "c"]),
            ("b", vec!["d"]),
            ("c", vec!["d"]),
            ("d", vec![]),
        ]);
        let sorted = topo_sort(&tree);
        let pa = sorted.iter().position(|s| s == "a").unwrap();
        let pd = sorted.iter().position(|s| s == "d").unwrap();
        assert!(pd < pa, "leaf 'd' must come before 'a': {sorted:?}");
        assert_eq!(sorted.len(), 4);
    }

    #[test]
    fn kahn_linear() {
        // a depends on b, b depends on c. Edges: a->b, b->c.
        // In-degrees: a=0, b=1, c=1. Queue starts with `a`.
        let tree = map([("a", vec!["b"]), ("b", vec!["c"]), ("c", vec![])]);
        let sorted = topo_sort_kahn(&tree);
        assert_eq!(sorted.len(), 3);
        assert_eq!(sorted, vec!["a", "b", "c"]);
    }

    #[test]
    fn kahn_cycle_omits_cyclic_nodes() {
        // a <-> b (cycle), c standalone
        let tree = map([("a", vec!["b"]), ("b", vec!["a"]), ("c", vec![])]);
        let sorted = topo_sort_kahn(&tree);
        assert_eq!(sorted, vec!["c"]);
    }
}
