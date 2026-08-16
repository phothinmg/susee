//! Unit tests for `graph::mutual::find_mutual_dependencies`.

use indexmap::IndexMap;
use susee::graph::mutual::find_mutual_dependencies;

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
fn finds_mutual_dependency_pair() {
    // a → b, b → a
    let graph = build_graph(&[("a", &["b"]), ("b", &["a"])]);
    let mutual = find_mutual_dependencies(&graph);
    assert_eq!(mutual.len(), 1);
    let pair = &mutual[0];
    assert!(
        (pair[0] == "a" && pair[1] == "b") || (pair[0] == "b" && pair[1] == "a"),
        "expected [a, b] or [b, a], got {pair:?}"
    );
}

#[test]
fn no_mutual_when_one_way() {
    let graph = build_graph(&[("a", &["b"]), ("b", &[])]);
    let mutual = find_mutual_dependencies(&graph);
    assert!(mutual.is_empty());
}

#[test]
fn mutual_pair_recorded_only_once() {
    let graph = build_graph(&[("a", &["b"]), ("b", &["a"])]);
    let mutual = find_mutual_dependencies(&graph);
    assert_eq!(mutual.len(), 1);
}

#[test]
fn finds_multiple_mutual_pairs() {
    // a ↔ b, c ↔ d
    let graph = build_graph(&[("a", &["b"]), ("b", &["a"]), ("c", &["d"]), ("d", &["c"])]);
    let mutual = find_mutual_dependencies(&graph);
    assert_eq!(mutual.len(), 2);
}

#[test]
fn empty_graph_has_no_mutual_deps() {
    let graph: IndexMap<String, Vec<String>> = IndexMap::new();
    let mutual = find_mutual_dependencies(&graph);
    assert!(mutual.is_empty());
}
