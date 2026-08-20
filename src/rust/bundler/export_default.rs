//! Export default renaming handler.
//!
//! Ported from `src/nodejs/bundler/lib/exportDefault.ts`.
//!
//! When bundling, `export default` declarations can cause name collisions
//! because multiple files may export defaults with the same name. This
//! module:
//! 1. Collects all `export default` declarations and assigns them unique names.
//! 2. Rewrites imports and usages in other files to reference the new name.

use std::collections::HashMap;

use oxc::ast::ast::{ExportDefaultDeclarationKind, ImportDeclarationSpecifier, Program, Statement};

use super::helpers::{get_file_key, with_parsed_program};
use super::types::{NamesSet, NamesSets};
use super::unique_name::UniqueName;
use crate::dependensa::{DepsFile, ValidExts};

const EXPORT_DEFAULT_PREFIX_KEY: &str = "ExportDefault";
const EXPORT_DEFAULT_PREFIX_VALUE: &str = "susee__exportDefault__";

/// Collect export default mappings from all dependency files.
///
/// Mirrors `collectExportDefaultMappings` from `exportDefault.ts`.
fn collect_export_default_mappings(
    deps: &[DepsFile],
    name_gen: &mut UniqueName,
    export_name_map: &mut NamesSets,
) {
    for dep in deps {
        if dep.file_ext == ValidExts::Json || dep.is_entry {
            continue;
        }
        let file_key = get_file_key(&dep.file);
        with_parsed_program(&dep.file, &dep.content, |program| {
            for stmt in &program.body {
                if let Statement::ExportDefaultDeclaration(export_default) = stmt {
                    match &export_default.declaration {
                        ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                            if let Some(id) = &func.id {
                                let base_name = id.name.as_str().to_string();
                                let new_name =
                                    name_gen.get_name(EXPORT_DEFAULT_PREFIX_KEY, &base_name);
                                export_name_map.push(NamesSet {
                                    base: base_name,
                                    file: file_key.clone(),
                                    new_name,
                                    is_ed: true,
                                });
                                break;
                            }
                        }
                        ExportDefaultDeclarationKind::ClassDeclaration(cls) => {
                            if let Some(id) = &cls.id {
                                let base_name = id.name.as_str().to_string();
                                let new_name =
                                    name_gen.get_name(EXPORT_DEFAULT_PREFIX_KEY, &base_name);
                                export_name_map.push(NamesSet {
                                    base: base_name,
                                    file: file_key.clone(),
                                    new_name,
                                    is_ed: true,
                                });
                                break;
                            }
                        }
                        ExportDefaultDeclarationKind::Identifier(ident) => {
                            let base_name = ident.name.as_str().to_string();
                            let new_name = name_gen.get_name(EXPORT_DEFAULT_PREFIX_KEY, &base_name);
                            export_name_map.push(NamesSet {
                                base: base_name,
                                file: file_key.clone(),
                                new_name,
                                is_ed: true,
                            });
                            break;
                        }
                        _ => {}
                    }
                }
            }
        });
    }
}

/// Build a lookup key from file and base name.
fn to_lookup_key(file: &str, base: &str) -> String {
    format!("{file}\0{base}")
}

/// Create a name lookup map from a list of name sets.
fn create_name_lookup(sets: &NamesSets) -> HashMap<String, String> {
    let mut lookup = HashMap::new();
    for set in sets {
        lookup.insert(to_lookup_key(&set.file, &set.base), set.new_name.clone());
    }
    lookup
}

/// Get a mapped name from the lookup.
fn get_mapped_name(lookup: &HashMap<String, String>, file: &str, base: &str) -> Option<String> {
    lookup.get(&to_lookup_key(file, base)).cloned()
}

/// Find import default specifiers that reference export default modules and
/// collect (old_name, new_name) replacement pairs.
fn collect_import_replacements(
    program: &Program<'_>,
    export_lookup: &HashMap<String, String>,
) -> Vec<(String, String)> {
    let mut replacements = Vec::new();

    for stmt in &program.body {
        if let Statement::ImportDeclaration(import_decl) = stmt {
            let module_spec = import_decl.source.value.as_str();
            if let Some(specifiers) = &import_decl.specifiers {
                for spec in specifiers {
                    if let ImportDeclarationSpecifier::ImportDefaultSpecifier(default_spec) = spec {
                        let base = default_spec.local.name.as_str().to_string();
                        if let Some(new_name) = get_mapped_name(export_lookup, module_spec, &base) {
                            replacements.push((base, new_name));
                        }
                    }
                }
            }
        }
    }

    replacements
}

/// Main entry point for export default handling.
///
/// Mirrors `exportDefaultHandler` from `exportDefault.ts`.
pub fn export_default_handler(deps: Vec<DepsFile>) -> Vec<DepsFile> {
    let mut name_gen = UniqueName::new();
    name_gen.set_prefix(EXPORT_DEFAULT_PREFIX_KEY, EXPORT_DEFAULT_PREFIX_VALUE);

    let mut export_name_map: NamesSets = Vec::new();
    collect_export_default_mappings(&deps, &mut name_gen, &mut export_name_map);

    // Build lookup map
    let export_lookup = create_name_lookup(&export_name_map);

    // Phase 1: Rewrite local declarations (rename the declared function/class)
    let mut updated_deps = Vec::with_capacity(deps.len());
    for dep in &deps {
        if dep.file_ext == ValidExts::Json || dep.is_entry {
            updated_deps.push(dep.clone());
            continue;
        }

        let file_key = get_file_key(&dep.file);
        let local_mapping = export_name_map.iter().find(|m| m.file == file_key).cloned();

        let mut content = dep.content.clone();

        if let Some(mapping) = &local_mapping {
            // Rename the local declaration
            content = super::resolve_json::replace_identifier_pub(
                &content,
                &mapping.base,
                &mapping.new_name,
            );
        }

        updated_deps.push(DepsFile {
            file: dep.file.clone(),
            content,
            bytes: dep.bytes,
            module_type: dep.module_type,
            file_ext: dep.file_ext,
            is_jsx: dep.is_jsx,
            is_entry: dep.is_entry,
        });
    }

    // Phase 2: Rewrite imports and usages
    let mut final_deps = Vec::with_capacity(updated_deps.len());
    for dep in &updated_deps {
        if dep.file_ext == ValidExts::Json || dep.is_entry {
            final_deps.push(dep.clone());
            continue;
        }

        let replacements = with_parsed_program(&dep.file, &dep.content, |program| {
            collect_import_replacements(program, &export_lookup)
        });

        if replacements.is_empty() {
            final_deps.push(dep.clone());
            continue;
        }

        let mut content = dep.content.clone();
        for (old_name, new_name) in &replacements {
            content = super::resolve_json::replace_identifier_pub(&content, old_name, new_name);
        }

        final_deps.push(DepsFile {
            file: dep.file.clone(),
            content,
            bytes: dep.bytes,
            module_type: dep.module_type,
            file_ext: dep.file_ext,
            is_jsx: dep.is_jsx,
            is_entry: dep.is_entry,
        });
    }

    final_deps
}
