//! Unit tests for `graph::utils`, mirroring the deduplication and
//! Node builtin detection tested in `__tests__/test-suites/graph.test.ts`.

use std::path::Path;
use susee::graph::utils::{
    CollectedObject, create_graph, is_node_builtin_module, merge_string_arr,
};

#[test]
fn detects_node_builtin_modules() {
    assert!(is_node_builtin_module("fs"));
    assert!(is_node_builtin_module("path"));
    assert!(is_node_builtin_module("child_process"));
    assert!(is_node_builtin_module("node:fs"));
    assert!(is_node_builtin_module("node:fs/promises"));
    assert!(is_node_builtin_module("node:path"));
}

#[test]
fn rejects_non_builtin_modules() {
    assert!(!is_node_builtin_module("typescript"));
    assert!(!is_node_builtin_module("react"));
    assert!(!is_node_builtin_module("./local"));
    assert!(!is_node_builtin_module("node:unknown-module"));
    assert!(!is_node_builtin_module("not-a-module"));
}

#[test]
fn merge_string_arr_deduplicates_preserving_order() {
    let input = vec![
        vec!["fs".to_string(), "typescript".to_string()],
        vec!["fs".to_string(), "path".to_string()],
        vec!["typescript".to_string(), "os".to_string()],
    ];
    let merged = merge_string_arr(&input);
    // Each name appears only once, in first-seen order
    assert_eq!(merged, vec!["fs", "typescript", "path", "os"]);
}

#[test]
fn merge_string_arr_empty_input() {
    let merged = merge_string_arr(&[]);
    assert!(merged.is_empty());
}

#[test]
fn create_graph_strips_root_prefix() {
    let deps = vec![
        CollectedObject {
            file: "/root/src/entry.ts".to_string(),
            index: 0,
            import_files: vec!["src/util.ts".to_string()],
        },
        CollectedObject {
            file: "/root/src/util.ts".to_string(),
            index: 1,
            import_files: vec![],
        },
    ];
    let graph = create_graph(&deps, Path::new("/root"));
    assert!(graph.contains_key("src/entry.ts"));
    assert!(graph.contains_key("src/util.ts"));
    assert_eq!(
        graph.get("src/entry.ts").unwrap(),
        &vec!["src/util.ts".to_string()]
    );
}

#[test]
fn create_graph_normalizes_backslashes_to_slashes() {
    let deps = vec![CollectedObject {
        file: "C:\\root\\src\\entry.ts".to_string(),
        index: 0,
        import_files: vec![],
    }];
    let graph = create_graph(&deps, Path::new("C:\\root"));
    // On non-Windows the prefix won't strip, but the path should use /
    let key = graph.keys().next().unwrap();
    assert!(!key.contains('\\'));
}
