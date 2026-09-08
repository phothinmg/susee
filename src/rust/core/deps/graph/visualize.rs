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
                let prefix = if is_last {
                    "  └── "
                } else {
                    "  ├── "
                };
                let _ = writeln!(result, "{prefix}{dep}");
            }
        }

        result.push('\n');
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::indexmap;

    #[test]
    fn header_present() {
        let graph = IndexMap::new();
        let text = visualize_dependencies(&graph);
        assert!(text.starts_with("Dependency Graph:"));
    }

    #[test]
    fn no_deps_marker() {
        let graph = indexmap! {
            "a".to_string() => vec![],
        };
        let text = visualize_dependencies(&graph);
        assert!(text.contains("a"));
        assert!(text.contains("(no dependencies)"));
    }

    #[test]
    fn tree_branches_for_multiple_deps() {
        let graph = indexmap! {
            "a".to_string() => vec!["b".to_string(), "c".to_string()],
        };
        let text = visualize_dependencies(&graph);
        // middle dep uses ├──, last dep uses └──
        assert!(text.contains("  ├── b"));
        assert!(text.contains("  └── c"));
    }

    #[test]
    fn single_dep_uses_last_branch() {
        let graph = indexmap! {
            "a".to_string() => vec!["b".to_string()],
        };
        let text = visualize_dependencies(&graph);
        assert!(text.contains("  └── b"));
        assert!(!text.contains("  ├── "));
    }
}
