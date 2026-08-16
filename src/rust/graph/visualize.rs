//! Visualize a dependency graph as a text-based tree.
//!
//! Ported from `deps/lib/visualize.ts`.

use indexmap::IndexMap;
use std::fmt::Write;

/// Visualize a dependency graph as a string.
///
/// Each file is represented by its name, and its dependencies are listed
/// underneath it. Files with no dependencies show `(no dependencies)`.
pub fn visualize_dependencies(dep_obj: &IndexMap<String, Vec<String>>) -> String {
    let mut result = String::from("Dependency Graph:\n\n");

    for (file, dependencies) in dep_obj.iter() {
        let _ = writeln!(result, "{file}");

        if dependencies.is_empty() {
            let _ = writeln!(result, "  └── (no dependencies)");
        } else {
            for (index, dep) in dependencies.iter().enumerate() {
                let is_last = index == dependencies.len() - 1;
                let prefix = if is_last { "  └── " } else { "  ├── " };
                let _ = writeln!(result, "{prefix}{dep}");
            }
        }

        result.push('\n');
    }

    result
}