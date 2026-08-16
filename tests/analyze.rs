//! Unit tests for `graph::analyze::analyze_dependencies`.

use indexmap::IndexMap;
use susee::graph::analyze::analyze_dependencies;

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
fn detects_circular_dependency() {
    // a → b → c → a
    let graph = build_graph(&[("a", &["b"]), ("b", &["c"]), ("c", &["a"])]);
    let analysis = analyze_dependencies(&graph);
    assert!(!analysis.circular_dependencies.is_empty());
    let chain = &analysis.circular_dependencies[0].chain;
    // The chain should start and end with the same node
    assert_eq!(chain.first(), chain.last());
    assert!(chain.contains(&"a".to_string()));
    assert!(chain.contains(&"b".to_string()));
    assert!(chain.contains(&"c".to_string()));
}

#[test]
fn no_circular_in_dag() {
    let graph = build_graph(&[("a", &["b"]), ("b", &["c"]), ("c", &[])]);
    let analysis = analyze_dependencies(&graph);
    assert!(analysis.circular_dependencies.is_empty());
}

#[test]
fn dependency_chains_include_all_files() {
    let graph = build_graph(&[("a", &["b"]), ("b", &["c"]), ("c", &[])]);
    let analysis = analyze_dependencies(&graph);
    assert!(analysis.dependency_chains.contains_key("a"));
    assert!(analysis.dependency_chains.contains_key("b"));
    assert!(analysis.dependency_chains.contains_key("c"));
}

#[test]
fn entry_to_leaf_chains_capture_paths() {
    // a → b → c (leaf)
    let graph = build_graph(&[("a", &["b"]), ("b", &["c"]), ("c", &[])]);
    let analysis = analyze_dependencies(&graph);
    // c is a leaf, so there should be a chain ending at c
    let leaf_chain = analysis
        .entry_to_leaf_chains
        .iter()
        .find(|chain| chain.last().map(|s| s.as_str()) == Some("c"));
    assert!(leaf_chain.is_some());
    let chain = leaf_chain.unwrap();
    assert!(chain.contains(&"a".to_string()));
    assert!(chain.contains(&"b".to_string()));
    assert!(chain.contains(&"c".to_string()));
}

#[test]
fn circular_dependency_type_is_circular() {
    let graph = build_graph(&[("a", &["b"]), ("b", &["a"])]);
    let analysis = analyze_dependencies(&graph);
    for cd in &analysis.circular_dependencies {
        assert_eq!(cd.r#type, "circular");
    }
}
