//! Find leaf files (files that don't import any other local files).
//!
//! Ported from `deps/lib/leaf.ts`.

use indexmap::IndexMap;

use super::utils::is_node_builtin_module;

/// Find leaf files — files with no local-file dependencies.
///
/// Filters out dependencies that are not local files (npm modules, node builtins).
pub fn find_leaf_files(dep_obj: &IndexMap<String, Vec<String>>) -> Vec<String> {
    dep_obj
        .iter()
        .filter(|(_, deps)| {
            let local_deps = deps.iter().filter(|dep| {
                dep.starts_with('.')
                    || (!dep.contains("node_modules") && !is_node_builtin_module(dep))
            });
            local_deps.count() == 0
        })
        .map(|(file, _)| file.clone())
        .collect()
}
