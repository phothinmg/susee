use std::collections::HashMap;

use susee_types::{DepsFile, NameToFileMap, NamesSet};
use susee_utils::{
    UniqueName, apply_renames, collect_top_level_declaration_names, sigil, with_parsed_program,
};

/// Detect cross-file duplicate top-level declaration names and rename them.
///
/// This mirrors the TS `checkDuplicates` hook from `duplicates.ts` but goes
/// further: instead of just reporting and exiting, it renames the colliding
/// names to unique alternatives so that bundling can proceed.
///
/// Only root-scope (top-level) **declarations** are checked — import bindings
/// are excluded so that an `import { a } from './a'` in one file is not treated
/// as a duplicate of `export const a` in another file. Renaming import
/// bindings would decouple them from their source and break the bundle.
/// Nested scopes are file-local and cannot collide across files.
pub fn check_duplicates(dep_files: Vec<DepsFile>) -> Vec<DepsFile> {
    // 1. Collect top-level declaration names per file (excluding imports).
    //    We walk the AST directly rather than using the semantic scope's
    //    `iter_bindings_in(root)` because the latter also returns import-
    //    introduced bindings, which must NOT be treated as declarations.
    let file_decl_names: Vec<Vec<String>> = dep_files
        .iter()
        .map(|dep| {
            with_parsed_program(&dep.file, &dep.content, |program| {
                collect_top_level_declaration_names(program)
                    .into_iter()
                    .map(|(name, _)| name)
                    .collect()
            })
        })
        .collect();

    // 2. Build a map: name → list of file indices that declare it at root scope.
    let mut name_to_files: NameToFileMap = HashMap::new();
    for (file_idx, names) in file_decl_names.iter().enumerate() {
        for name in names {
            name_to_files
                .entry(name.clone())
                .or_default()
                .push((file_idx, vec![]));
        }
    }

    // 3. Filter to only names that appear in 2+ files (duplicates).
    let duplicates: NameToFileMap = name_to_files
        .into_iter()
        .filter(|(_, entries)| entries.len() > 1)
        .collect();

    if duplicates.is_empty() {
        return dep_files;
    }

    // 4. Report duplicates (warning, not error — we will rename them).
    for (name, entries) in &duplicates {
        let locations: Vec<String> = entries
            .iter()
            .map(|(file_idx, _)| dep_files[*file_idx].file.clone())
            .collect();
        let info = format!(
            "Duplicate top-level declaration \"{}\" found in {} files: {}",
            name,
            entries.len(),
            locations.join(", ")
        );
        let cause =
            "These names will be renamed to unique names to avoid collisions during bundling.";
        susee_log::warning(&info);
        let _ = cause;
    }

    // 5. Build rename maps per file using UniqueName.
    let mut unique = UniqueName::new();
    unique.set_prefix("Duplicates", sigil::DUPLICATE);
    // rename_map[file_idx][original_name] = new_name
    let mut rename_maps: Vec<HashMap<String, String>> =
        (0..dep_files.len()).map(|_| HashMap::new()).collect();
    // names_sets: collect NamesSet entries for observability.
    let mut _names_sets: Vec<NamesSet> = Vec::new();

    for (name, entries) in &duplicates {
        for (file_idx, symbol_ids) in entries {
            // Use the original declaration `name` as the base for the
            // generated identifier so the result is readable (e.g.
            // `_ushared$1`). The per-category counter disambiguates
            // the same name appearing in multiple files. `UniqueName`
            // sanitizes the input into a valid JS identifier tail.
            let file_path = &dep_files[*file_idx].file;
            let new_name = unique.get_name("Duplicates", name);
            rename_maps[*file_idx].insert(name.clone(), new_name.clone());
            _names_sets.push(NamesSet {
                base: name.clone(),
                file: file_path.clone(),
                new_name: new_name.clone(),
                is_ed: true,
            });
            let _ = symbol_ids;
        }
    }

    // 6. Apply renames to each file's content.
    let mut result = Vec::with_capacity(dep_files.len());
    for (file_idx, dep) in dep_files.into_iter().enumerate() {
        let rename_map = &rename_maps[file_idx];
        if rename_map.is_empty() {
            result.push(dep);
            continue;
        }

        let new_content = apply_renames(&dep.file, &dep.content, rename_map);
        let new_bytes = new_content.len();
        result.push(DepsFile {
            file: dep.file,
            content: new_content,
            bytes: new_bytes,
            module_type: dep.module_type,
            file_ext: dep.file_ext,
            is_jsx: dep.is_jsx,
            is_entry: dep.is_entry,
        });
    }

    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_duplicates_unchanged() {
        let deps = vec![
            susee_utils::make_dep("src/a.ts", "export const alpha = 1;\n"),
            susee_utils::make_dep("src/b.ts", "export const beta = 2;\n"),
        ];
        let result = check_duplicates(deps);
        assert_eq!(result[0].content, "export const alpha = 1;\n");
        assert_eq!(result[1].content, "export const beta = 2;\n");
    }

    #[test]
    fn renames_duplicate_top_level_names() {
        let deps = vec![
            susee_utils::make_dep(
                "src/a.ts",
                "export const shared = 1;\nexport function useShared() { return shared; }\n",
            ),
            susee_utils::make_dep("src/b.ts", "export const shared = 2;\n"),
        ];
        let result = check_duplicates(deps);
        // Both `shared` declarations should have been renamed (to different names).
        assert!(!result[0].content.contains("const shared"));
        assert!(!result[1].content.contains("const shared"));
        // The reference `useShared` contains "Shared" but not "shared" as a declaration.
        // The function name itself is unique, so it should be unchanged.
        assert!(result[0].content.contains("useShared"));
        // The renamed declarations should use the duplicate sigil (`_u`).
        assert!(result[0].content.contains("_ushared$"));
        assert!(result[1].content.contains("_ushared$"));
    }

    #[test]
    fn nested_scopes_not_renamed() {
        let deps = vec![
            susee_utils::make_dep(
                "src/a.ts",
                "export function alpha() { const local = 1; return local; }\n",
            ),
            susee_utils::make_dep(
                "src/b.ts",
                "export function beta() { const local = 2; return local; }\n",
            ),
        ];
        let result = check_duplicates(deps);
        // `local` is inside function scopes, not top-level — should be unchanged.
        assert!(result[0].content.contains("local"));
        assert!(result[1].content.contains("local"));
    }

    #[test]
    fn duplicate_references_renamed() {
        let deps = vec![
            susee_utils::make_dep("src/a.ts", "const shared = 1;\nexport { shared };\n"),
            susee_utils::make_dep("src/b.ts", "const shared = 2;\nexport { shared };\n"),
        ];
        let result = check_duplicates(deps);
        // Both declaration and export specifier should be renamed.
        assert!(!result[0].content.contains("const shared"));
        assert!(!result[1].content.contains("const shared"));
        assert!(!result[0].content.contains("export { shared"));
        assert!(!result[1].content.contains("export { shared"));
        // The renamed identifiers should use the duplicate sigil (`_u`).
        assert!(result[0].content.contains("_ushared$"));
        assert!(result[1].content.contains("_ushared$"));
    }
}
