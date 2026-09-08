use indexmap::IndexMap;
use std::path::Path;

/// A collected dependency entry.
///
/// Produced by the dependency collector for every file visited during the
/// traversal. Each entry records the absolute file path, a traversal index,
/// and the list of local-file dependencies discovered inside it.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CollectedObject {
    /// Absolute path of the visited file.
    pub file: String,
    /// Zero-based index in traversal (insertion) order.
    pub index: usize,
    /// Local relative imports discovered in `file` (e.g. `./foo`).
    pub import_files: Vec<String>,
}

/// Node.js built-in modules (as of Node 22+).
///
/// In the original TS code this came from `module.builtinModules`.
/// We hard-code the list here.
const NODE_BUILTIN_MODULES: &[&str] = &[
    "_http_agent",
    "_http_client",
    "_http_common",
    "_http_incoming",
    "_http_outgoing",
    "_http_server",
    "_stream_duplex",
    "_stream_passthrough",
    "_stream_readable",
    "_stream_transform",
    "_stream_wrap",
    "_stream_writable",
    "_tls_common",
    "_tls_wrap",
    "assert",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "domain",
    "events",
    "fs",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "sqlite",
    "stream",
    "string_decoder",
    "sys",
    "test",
    "timers",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
];

/// Check if a given module specifier is a Node.js built-in module.
///
/// A module is built-in if it starts with `node:` or matches a name in the
/// built-in modules list. For `node:` prefixed specifiers, the part after
/// `node:` is checked against the built-in list.
pub fn is_node_builtin_module(input: &str) -> bool {
    if let Some(rest) = input.strip_prefix("node:") {
        // `node:fs/promises` etc. — check the top-level name
        let top = rest.split('/').next().unwrap_or(rest);
        NODE_BUILTIN_MODULES.contains(&top)
    } else {
        NODE_BUILTIN_MODULES.contains(&input)
    }
}

/// Create a dependency graph from collected dependency objects.
///
/// Returns a map where each key is a file path (relative to `root`) and each
/// value is the list of files that the key file depends on.
pub fn create_graph(deps: &[CollectedObject], root: &Path) -> IndexMap<String, Vec<String>> {
    let mut graph: IndexMap<String, Vec<String>> = IndexMap::new();
    for dep in deps {
        let name = relative_path(root, &dep.file);
        graph.insert(name, dep.import_files.clone());
    }
    graph
}

/// Compute `dep.file` relative to `root`, using `/` as separator.
fn relative_path(root: &Path, file: &str) -> String {
    let file_path = Path::new(file);
    file_path
        .strip_prefix(root)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| file_path.to_string_lossy().replace('\\', "/"))
}

/// Merge an array of string arrays into a single deduplicated string array.
///
/// Deduplicates while preserving first-seen order, so the npm/node/warning
/// lists contain unique entries only.
pub fn merge_string_arr(input: &[Vec<String>]) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for arr in input {
        for item in arr {
            if seen.insert(item.clone()) {
                result.push(item.clone());
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn detects_bare_builtins() {
        assert!(is_node_builtin_module("fs"));
        assert!(is_node_builtin_module("path"));
        assert!(is_node_builtin_module("crypto"));
    }

    #[test]
    fn detects_node_prefixed_builtins() {
        assert!(is_node_builtin_module("node:fs"));
        assert!(is_node_builtin_module("node:path"));
        assert!(is_node_builtin_module("node:fs/promises"));
    }

    #[test]
    fn rejects_non_builtins() {
        assert!(!is_node_builtin_module("react"));
        assert!(!is_node_builtin_module("./foo"));
        assert!(!is_node_builtin_module("node:nonexistent"));
        assert!(!is_node_builtin_module("node:nonexistent/sub"));
    }

    #[test]
    fn create_graph_relative_keys() {
        let deps = vec![
            CollectedObject {
                file: "/root/src/a.ts".to_string(),
                index: 0,
                import_files: vec!["./b".to_string()],
            },
            CollectedObject {
                file: "/root/src/b.ts".to_string(),
                index: 1,
                import_files: vec![],
            },
        ];
        let graph = create_graph(&deps, Path::new("/root"));
        assert_eq!(graph.len(), 2);
        assert_eq!(
            graph.get("src/a.ts").map(|v| v.as_slice()),
            Some(["./b".to_string()].as_slice())
        );
        assert_eq!(
            graph.get("src/b.ts").map(|v| v.as_slice()),
            Some([].as_slice())
        );
    }

    #[test]
    fn merge_deduplicates_preserving_order() {
        let input = vec![
            vec!["a".to_string(), "b".to_string()],
            vec!["b".to_string(), "c".to_string()],
            vec!["a".to_string(), "d".to_string()],
        ];
        let merged = merge_string_arr(&input);
        assert_eq!(merged, vec!["a", "b", "c", "d"]);
    }

    #[test]
    fn merge_empty_input() {
        let merged = merge_string_arr(&[]);
        assert!(merged.is_empty());
    }

    #[test]
    fn merge_all_empty_inner() {
        let merged = merge_string_arr(&[vec![], vec![]]);
        assert!(merged.is_empty());
    }
}
