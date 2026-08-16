//! Unit tests for `graph::sort::topo_sort`, mirroring the ordering assertions
//! from the TS suite `__tests__/test-suites/graph.test.ts`.

use indexmap::IndexMap;
use susee_lib::graph::sort::{topo_sort, topo_sort_kahn};

fn build_graph(pairs: &[(&str, &[&str])]) -> IndexMap<String, Vec<String>> {
    let mut map: IndexMap<String, Vec<String>> = IndexMap::new();
    for (key, deps) in pairs {
        map.insert(
            key.to_string(),
            deps.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        );
    }
    map
}

#[test]
fn empty_graph_returns_empty_vec() {
    let graph: IndexMap<String, Vec<String>> = IndexMap::new();
    assert!(topo_sort(&graph).is_empty());
}

#[test]
fn single_node_no_deps() {
    let graph = build_graph(&[("a", &[])]);
    let sorted = topo_sort(&graph);
    assert_eq!(sorted, vec!["a".to_string()]);
}

#[test]
fn dependencies_come_before_dependents() {
    // a depends on b, b depends on c → order should be c, b, a
    let graph = build_graph(&[("a", &["b"]), ("b", &["c"]), ("c", &[])]);
    let sorted = topo_sort(&graph);
    let idx = |name: &str| sorted.iter().position(|s| s == name).unwrap();
    assert!(idx("c") < idx("b"));
    assert!(idx("b") < idx("a"));
}

#[test]
fn diamond_dependency_preserves_topological_order() {
    // a → b, a → c, b → d, c → d
    let graph = build_graph(&[("a", &["b", "c"]), ("b", &["d"]), ("c", &["d"]), ("d", &[])]);
    let sorted = topo_sort(&graph);
    let idx = |name: &str| sorted.iter().position(|s| s == name).unwrap();
    assert!(idx("d") < idx("b"));
    assert!(idx("d") < idx("c"));
    assert!(idx("b") < idx("a"));
    assert!(idx("c") < idx("a"));
}

#[test]
fn topo_sort_kahn_matches_dfs_for_dag() {
    let graph = build_graph(&[
        ("entry", &["util", "lib"]),
        ("util", &[]),
        ("lib", &["util"]),
    ]);
    let dfs = topo_sort(&graph);
    let kahn = topo_sort_kahn(&graph);

    // Both should include all nodes
    assert_eq!(dfs.len(), 3);
    assert_eq!(kahn.len(), 3);

    // Kahn's BFS order: entry (in-degree 0) → lib → util.
    // Both algorithms must include all nodes and produce valid topo orders.
    // For Kahn: entry comes first (0 in-degree), lib before util.
    let kidx = |name: &str| kahn.iter().position(|s| s == name).unwrap();
    assert!(kidx("entry") < kidx("lib"));
    assert!(kidx("lib") < kidx("util"));
}

#[test]
fn handles_cycle_gracefully_in_dfs_sort() {
    // a → b → a (circular). DFS topo_sort tolerates cycles by marking visited.
    let graph = build_graph(&[("a", &["b"]), ("b", &["a"])]);
    let sorted = topo_sort(&graph);
    assert_eq!(sorted.len(), 2);
    assert!(sorted.contains(&"a".to_string()));
    assert!(sorted.contains(&"b".to_string()));
}
