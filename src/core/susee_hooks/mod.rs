use crate::core::susee_types::DependenciesTree;

mod pre_process_hooks;
mod tree_hooks;

pub fn run_tree_hooks(tree: DependenciesTree) -> DependenciesTree {
    // 1. Normalize anonymous default exports/imports.
    let dep_files = tree_hooks::anonymous::anonymous_handler(tree.dep_files);
    // 2. Rename named default exports (`export default function foo()`).
    let dep_files = tree_hooks::export_default::export_default_handler(dep_files);
    // 3. Detect and rename cross-file duplicate top-level declarations.
    let dep_files = tree_hooks::duplicates::check_duplicates(dep_files);
    // 4. Remove all import/export statements (strip modifiers, delete
    //    re-export specifiers, remove import declarations).
    let dep_files = tree_hooks::remove::remove_handler_simple(dep_files);
    DependenciesTree {
        entry: tree.entry,
        npm: tree.npm,
        nodes: tree.nodes,
        warns: tree.warns,
        dep_files,
        project_type: tree.project_type,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::susee_utils::make_dep;
    #[test]
    fn run_hooks_preserves_tree_fields() {
        use crate::core::susee_types::{DependenciesTree, ProjectType};
        let tree = DependenciesTree {
            entry: "src/index.ts".to_string(),
            npm: vec!["react".to_string()],
            nodes: vec!["node:fs".to_string()],
            warns: vec![],
            dep_files: vec![
                make_dep("src/a.ts", "export const shared = 1;\n"),
                make_dep("src/b.ts", "export const shared = 2;\n"),
            ],
            project_type: ProjectType::TS,
        };
        let result = run_tree_hooks(tree);
        assert_eq!(result.entry, "src/index.ts");
        assert_eq!(result.npm, vec!["react".to_string()]);
        assert_eq!(result.nodes, vec!["node:fs".to_string()]);
        assert_eq!(result.project_type, ProjectType::TS);
        // Duplicates should be renamed.
        assert!(!result.dep_files[0].content.contains("shared"));
    }
}
