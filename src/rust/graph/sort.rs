//! Topological sort of a directed acyclic graph (DAG).
//!
//! Ported from `deps/lib/sort.ts`.

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
/// utility for consumers that prefer BFS ordering.
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
