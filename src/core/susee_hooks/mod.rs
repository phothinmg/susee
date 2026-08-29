use crate::core::susee_types::DependenciesTree;

pub mod pre_process_hooks;
mod tree_hooks;

pub use pre_process_hooks::clean;

/// Run all tree hooks and return the processed tree plus a list of removed
/// import statements (as text) that the bundler should re-emit at the top of
/// the bundle.
pub fn run_tree_hooks(tree: DependenciesTree) -> (DependenciesTree, Vec<String>) {
    // 1. Rename named default exports (`export default function foo()`).
    //
    // This MUST run before the anonymous handler so that the anonymous
    // handler does not pick up already-named default exports and so that
    // the export-default handler does not re-rename names assigned by the
    // anonymous handler. The TS implementation runs exportDefault (step 4)
    // before anonymous (step 5).
    let dep_files = tree_hooks::export_default::export_default_handler(tree.dep_files);
    // 2. Normalize anonymous default exports/imports.
    let dep_files = tree_hooks::anonymous::anonymous_handler(dep_files);
    // 3. Detect and rename cross-file duplicate top-level declarations.
    let dep_files = tree_hooks::duplicates::check_duplicates(dep_files);
    // 4. Remove all import/export statements (strip modifiers, delete
    //    re-export specifiers, remove import declarations). Collect removed
    //    import statements so the bundler can re-emit them.
    let (dep_files, removed_imports) = tree_hooks::remove::remove_handler(dep_files);
    let removed_statements: Vec<String> = removed_imports.into_iter().map(|r| r.text).collect();
    let tree = DependenciesTree {
        entry: tree.entry,
        npm: tree.npm,
        nodes: tree.nodes,
        warns: tree.warns,
        dep_files,
        project_type: tree.project_type,
    };
    (tree, removed_statements)
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
        let (result, removed) = run_tree_hooks(tree);
        assert_eq!(result.entry, "src/index.ts");
        assert_eq!(result.npm, vec!["react".to_string()]);
        assert_eq!(result.nodes, vec!["node:fs".to_string()]);
        assert_eq!(result.project_type, ProjectType::TS);
        // Duplicates should be renamed (the original `const shared`
        // declaration is gone; the renamed identifier uses the `_u` sigil).
        assert!(!result.dep_files[0].content.contains("const shared"));
        assert!(result.dep_files[0].content.contains("_ushared$"));
        // No imports in the test files, so no removed statements.
        assert!(removed.is_empty());
    }
}
