//! Utility functions: Node built-in module detection, graph creation, array merging.
//!
//! Ported from `deps/lib/utils.ts`.

use indexmap::IndexMap;
use std::path::Path;

/// A collected dependency entry.
#[derive(Debug, Clone)]
pub struct CollectedObject {
    pub file: String,
    pub index: usize,
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
