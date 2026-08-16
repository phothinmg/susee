//! Unit tests for `graph::leaf::find_leaf_files`.

use indexmap::IndexMap;
use susee::graph::leaf::find_leaf_files;

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
fn finds_files_with_no_local_deps() {
    // entry depends on util; util has no deps → util is a leaf
    let graph = build_graph(&[("src/entry.ts", &["src/util.ts"]), ("src/util.ts", &[])]);
    let leaves = find_leaf_files(&graph);
    assert_eq!(leaves, vec!["src/util.ts".to_string()]);
}

#[test]
fn files_with_only_node_builtin_deps_are_leaves() {
    let graph = build_graph(&[
        ("src/entry.ts", &["src/io.ts"]),
        ("src/io.ts", &["fs", "path"]),
    ]);
    let leaves = find_leaf_files(&graph);
    assert_eq!(leaves, vec!["src/io.ts".to_string()]);
}

#[test]
fn files_with_only_non_local_relative_deps_are_leaves() {
    let graph = build_graph(&[("src/entry.ts", &["src/helper.ts"]), ("src/helper.ts", &[])]);
    let leaves = find_leaf_files(&graph);
    assert_eq!(leaves, vec!["src/helper.ts".to_string()]);
}

#[test]
fn no_leaves_when_all_files_have_local_deps() {
    let graph = build_graph(&[("a", &["b"]), ("b", &["a"])]);
    let leaves = find_leaf_files(&graph);
    assert!(leaves.is_empty());
}

#[test]
fn all_files_are_leaves_when_no_deps() {
    let graph = build_graph(&[("a", &[]), ("b", &[])]);
    let leaves = find_leaf_files(&graph);
    assert_eq!(leaves.len(), 2);
    assert!(leaves.contains(&"a".to_string()));
    assert!(leaves.contains(&"b".to_string()));
}
