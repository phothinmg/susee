//! Unit tests for `graph::visualize::visualize_dependencies`.

use indexmap::IndexMap;
use susee::graph::visualize::visualize_dependencies;

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
fn empty_graph_produces_header_only() {
    let graph: IndexMap<String, Vec<String>> = IndexMap::new();
    let text = visualize_dependencies(&graph);
    assert!(text.starts_with("Dependency Graph:"));
    // No file lines after the header
    assert_eq!(text.trim_end(), "Dependency Graph:");
}

#[test]
fn file_with_no_deps_shows_placeholder() {
    let graph = build_graph(&[("a.ts", &[])]);
    let text = visualize_dependencies(&graph);
    assert!(text.contains("a.ts"));
    assert!(text.contains("(no dependencies)"));
}

#[test]
fn file_with_single_dep_uses_last_prefix() {
    let graph = build_graph(&[("entry.ts", &["util.ts"])]);
    let text = visualize_dependencies(&graph);
    assert!(text.contains("entry.ts"));
    assert!(text.contains("└── util.ts"));
}

#[test]
fn file_with_multiple_deps_uses_branch_prefix() {
    let graph = build_graph(&[("entry.ts", &["a.ts", "b.ts"])]);
    let text = visualize_dependencies(&graph);
    // First dep uses ├──, last uses └──
    assert!(text.contains("├── a.ts"));
    assert!(text.contains("└── b.ts"));
}
