//! Anonymous export/import handler.
//!
//! Ported from `src/nodejs/bundler/lib/anonymous.ts`.
//!
//! Handles `export default` of anonymous functions/classes and expressions
//! (arrow functions, object literals, array literals, strings, numbers) by:
//! 1. Assigning a unique name to the anonymous default export.
//! 2. Converting `export default <expr>` to `const name = <expr>; export default name;`.
//! 3. Renaming imports and usages that reference the anonymous default export.

use std::path::Path;

use oxc::ast::ast::{ExportDefaultDeclarationKind, ImportDeclarationSpecifier, Program, Statement};
use oxc::span::GetSpan;

use super::helpers::with_parsed_program;
use super::types::{NamesSet, NamesSets};
use super::unique_name::UniqueName;
use crate::core::dependensa::{DepsFile, ValidExts};

const ANONYMOUS_PREFIX_KEY: &str = "AnonymousName";
const ANONYMOUS_PREFIX_VALUE: &str = "susee__anonymous__";

/// Collect anonymous export default mappings from all dependency files.
///
/// For each file with `export default <anonymous>`, generates a unique name
/// and records the mapping.
fn collect_anonymous_mappings(
    deps: &[DepsFile],
    name_gen: &mut UniqueName,
    export_name_map: &mut NamesSets,
) {
    for dep in deps {
        if dep.file_ext == ValidExts::Json || dep.is_entry {
            continue;
        }
        let file_name = Path::new(&dep.file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        with_parsed_program(&dep.file, &dep.content, |program| {
            for stmt in &program.body {
                if let Statement::ExportDefaultDeclaration(export_default) = stmt {
                    match &export_default.declaration {
                        ExportDefaultDeclarationKind::FunctionDeclaration(func)
                            if func.id.is_none() =>
                        {
                            let base = name_gen.get_name(ANONYMOUS_PREFIX_KEY, &file_name);
                            export_name_map.push(NamesSet {
                                base: base.clone(),
                                file: file_name.clone(),
                                new_name: base,
                                is_ed: true,
                            });
                            break;
                        }
                        ExportDefaultDeclarationKind::ClassDeclaration(cls) if cls.id.is_none() => {
                            let base = name_gen.get_name(ANONYMOUS_PREFIX_KEY, &file_name);
                            export_name_map.push(NamesSet {
                                base: base.clone(),
                                file: file_name.clone(),
                                new_name: base,
                                is_ed: true,
                            });
                            break;
                        }
                        // Expression exports (arrow, object, array, string, number)
                        ExportDefaultDeclarationKind::ArrowFunctionExpression(_)
                        | ExportDefaultDeclarationKind::ObjectExpression(_)
                        | ExportDefaultDeclarationKind::ArrayExpression(_)
                        | ExportDefaultDeclarationKind::StringLiteral(_)
                        | ExportDefaultDeclarationKind::NumericLiteral(_) => {
                            let base = name_gen.get_name(ANONYMOUS_PREFIX_KEY, &file_name);
                            export_name_map.push(NamesSet {
                                base: base.clone(),
                                file: file_name.clone(),
                                new_name: base,
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

/// Convert anonymous `export default <expr>` to `const name = <expr>; export default name;`
/// using source-text extraction.
fn convert_anonymous_export(content: &str, file: &str, mapping: &NamesSet) -> String {
    with_parsed_program(file, content, |program| {
        let source_text = program.source_text;
        let new_name = &mapping.new_name;

        let mut result = String::with_capacity(content.len());
        let mut found = false;

        for stmt in &program.body {
            if found {
                let text = stmt.span().source_text(source_text);
                result.push_str(text);
                result.push('\n');
                continue;
            }

            if let Statement::ExportDefaultDeclaration(export_default) = stmt {
                match &export_default.declaration {
                    // Anonymous function: `export default function() {}` → `function name() {}`
                    ExportDefaultDeclarationKind::FunctionDeclaration(func)
                        if func.id.is_none() =>
                    {
                        // Extract the function source text and inject the name
                        let func_text = func.span().source_text(source_text);
                        let named_func = inject_function_name(func_text, new_name);
                        result.push_str(&named_func);
                        result.push('\n');
                        found = true;
                        continue;
                    }
                    // Anonymous class: `export default class {}` → `class name {}`
                    ExportDefaultDeclarationKind::ClassDeclaration(cls) if cls.id.is_none() => {
                        let cls_text = cls.span().source_text(source_text);
                        let named_cls = inject_class_name(cls_text, new_name);
                        result.push_str(&named_cls);
                        result.push('\n');
                        found = true;
                        continue;
                    }
                    // Expression exports: `export default <expr>` → `const name = <expr>; export default name;`
                    ExportDefaultDeclarationKind::ArrowFunctionExpression(_)
                    | ExportDefaultDeclarationKind::ObjectExpression(_)
                    | ExportDefaultDeclarationKind::ArrayExpression(_)
                    | ExportDefaultDeclarationKind::StringLiteral(_)
                    | ExportDefaultDeclarationKind::NumericLiteral(_) => {
                        let expr_text = export_default.declaration.span().source_text(source_text);
                        result.push_str(&format!("const {new_name} = {expr_text};\n"));
                        result.push_str(&format!("export default {new_name};\n"));
                        found = true;
                        continue;
                    }
                    _ => {}
                }
            }

            let text = stmt.span().source_text(source_text);
            result.push_str(text);
            result.push('\n');
        }

        result
    })
}

/// Inject a name into a function declaration source text.
/// `function() {}` → `function name() {}`
fn inject_function_name(func_text: &str, name: &str) -> String {
    // Find "function" keyword and insert name after it
    if let Some(pos) = func_text.find("function") {
        let after = &func_text[pos + "function".len()..];
        format!("{}function {name}{}", &func_text[..pos], after)
    } else {
        func_text.to_string()
    }
}

/// Inject a name into a class declaration source text.
/// `class {}` → `class name {}`
fn inject_class_name(cls_text: &str, name: &str) -> String {
    if let Some(pos) = cls_text.find("class") {
        let after = &cls_text[pos + "class".len()..];
        format!("{}class {name}{}", &cls_text[..pos], after)
    } else {
        cls_text.to_string()
    }
}

/// Find import default specifiers that reference anonymous default exports
/// and collect (old_name, new_name) replacement pairs.
fn collect_anonymous_import_replacements(
    program: &Program<'_>,
    export_name_map: &NamesSets,
) -> Vec<(String, String)> {
    let mut replacements = Vec::new();

    for stmt in &program.body {
        if let Statement::ImportDeclaration(import_decl) = stmt {
            let module_spec = import_decl.source.value.as_str();
            let file_name = Path::new(module_spec)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();

            if let Some(mapping) = export_name_map.iter().find(|m| m.file == file_name) {
                if let Some(specifiers) = &import_decl.specifiers {
                    for spec in specifiers {
                        if let ImportDeclarationSpecifier::ImportDefaultSpecifier(default_spec) =
                            spec
                        {
                            replacements.push((
                                default_spec.local.name.as_str().to_string(),
                                mapping.new_name.clone(),
                            ));
                        }
                    }
                }
            }
        }
    }

    replacements
}

/// Main entry point for anonymous handler.
///
/// Mirrors `anonymousHandler` from `anonymous.ts`.
pub fn anonymous_handler(deps: Vec<DepsFile>) -> Vec<DepsFile> {
    let mut name_gen = UniqueName::new();
    name_gen.set_prefix(ANONYMOUS_PREFIX_KEY, ANONYMOUS_PREFIX_VALUE);

    let mut export_name_map: NamesSets = Vec::new();
    collect_anonymous_mappings(&deps, &mut name_gen, &mut export_name_map);

    // Phase 1: Convert anonymous exports to named declarations
    let mut updated_deps = Vec::with_capacity(deps.len());
    for dep in &deps {
        if dep.file_ext == ValidExts::Json || dep.is_entry {
            updated_deps.push(dep.clone());
            continue;
        }

        let file_name = Path::new(&dep.file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let mapping = export_name_map
            .iter()
            .find(|m| m.file == file_name)
            .cloned();

        let new_content = match mapping {
            Some(m) => convert_anonymous_export(&dep.content, &dep.file, &m),
            None => dep.content.clone(),
        };

        updated_deps.push(DepsFile {
            file: dep.file.clone(),
            content: new_content,
            bytes: dep.bytes,
            module_type: dep.module_type,
            file_ext: dep.file_ext,
            is_jsx: dep.is_jsx,
            is_entry: dep.is_entry,
        });
    }

    // Phase 2: Rename imports and usages using text-based approach
    let mut final_deps = Vec::with_capacity(updated_deps.len());
    for dep in &updated_deps {
        if dep.file_ext == ValidExts::Json {
            final_deps.push(dep.clone());
            continue;
        }

        let replacements = with_parsed_program(&dep.file, &dep.content, |program| {
            collect_anonymous_import_replacements(program, &export_name_map)
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
