//! Import/Export removal handlers.
//!
//! Ported from `src/nodejs/bundler/lib/remove.ts`.
//!
//! Provides two functions:
//! - [`remove_imports`] — removes all import declarations, import-equals,
//!   and require() calls, collecting the removed import text for later merging.
//! - [`remove_exports`] — strips `export` modifiers / declarations from
//!   the dependency files (but not from the entry file).

use std::collections::HashSet;

use oxc::ast::ast::{
    BindingPattern, ExportDefaultDeclarationKind, Expression, ImportOrExportKind, Program,
    Statement, TSImportEqualsDeclaration, TSModuleReference, VariableDeclaration,
    VariableDeclarationKind,
};
use oxc::ast_visit::Visit;
use oxc::span::GetSpan;

use super::helpers::with_parsed_program;

/// Remove imports from a source file, collecting removed import text.
///
/// Mirrors the `importAllRemoveHandler` call. Returns the transformed source
/// and appends removed import text to `removed_statements`.
pub fn remove_imports(file: &str, content: &str, removed_statements: &mut Vec<String>) -> String {
    with_parsed_program(file, content, |program| {
        let source_text = program.source_text;

        // Pre-scan: collect property access names for namespace detection.
        let properties = collect_property_access_names(program);

        // Pre-scan: collect names of type-only import-equals.
        let mut type_only_import_equals: HashSet<String> = HashSet::new();
        for stmt in &program.body {
            if let Statement::TSImportEqualsDeclaration(import_eq) = stmt {
                if import_eq.import_kind == ImportOrExportKind::Type {
                    if let TSModuleReference::ExternalModuleReference(_) =
                        &import_eq.module_reference
                    {
                        type_only_import_equals.insert(import_eq.id.name.as_str().to_string());
                    }
                }
            }
        }

        // Build the output by keeping only non-import statements.
        let mut result = String::with_capacity(content.len());

        for stmt in &program.body {
            match stmt {
                // Case 1: Import declarations — collect text, skip.
                Statement::ImportDeclaration(import_decl) => {
                    let text = import_decl.span.source_text(source_text).to_string();
                    removed_statements.push(text);
                    continue;
                }

                // Case 2: Import-equals declarations.
                Statement::TSImportEqualsDeclaration(import_eq) => {
                    if let Some(replacement_text) =
                        process_import_equals(import_eq, &properties, &type_only_import_equals)
                    {
                        removed_statements.push(replacement_text);
                        continue;
                    }
                    // If we can't generate a replacement, still remove it.
                    let text = import_eq.span.source_text(source_text).to_string();
                    removed_statements.push(text);
                    continue;
                }

                // Case 3: Variable statement with require() — convert to import.
                Statement::VariableDeclaration(var_decl) => {
                    if let Some(replacement_text) = process_require_variable(var_decl, &properties)
                    {
                        removed_statements.push(replacement_text);
                        continue;
                    }
                }

                _ => {}
            }

            // Keep this statement — extract its source text.
            let text = stmt.span().source_text(source_text);
            result.push_str(text);
            result.push('\n');
        }

        result
    })
}

/// Process an import-equals declaration, returning the replacement import text.
fn process_import_equals(
    import_eq: &TSImportEqualsDeclaration<'_>,
    properties: &HashSet<String>,
    type_only_import_equals: &HashSet<String>,
) -> Option<String> {
    let name = import_eq.id.name.as_str();
    let is_type_only = import_eq.import_kind == ImportOrExportKind::Type;

    let source = match &import_eq.module_reference {
        TSModuleReference::ExternalModuleReference(ext) => {
            ext.expression.value.as_str().to_string()
        }
        _ => return None,
    };

    let is_namespace = properties.contains(name);

    if is_type_only {
        if type_only_import_equals.contains(name) {
            return Some(format!("import type * as {name} from \"{source}\";"));
        }
        return Some(format!("import type {name} from \"{source}\";"));
    }

    if is_namespace && source != "typescript" {
        Some(format!("import * as {name} from \"{source}\";"))
    } else {
        Some(format!("import {name} from \"{source}\";"))
    }
}

/// Process a variable declaration with require(), returning the replacement import text.
fn process_require_variable(
    var_decl: &VariableDeclaration<'_>,
    properties: &HashSet<String>,
) -> Option<String> {
    if var_decl.kind != VariableDeclarationKind::Const {
        return None;
    }
    let decl = var_decl.declarations.first()?;
    let initializer = decl.init.as_ref()?;
    let Expression::CallExpression(call) = initializer else {
        return None;
    };
    let Expression::Identifier(ident) = &call.callee else {
        return None;
    };
    if ident.name.as_str() != "require" {
        return None;
    }
    let arg = call.arguments.first()?;
    let Expression::StringLiteral(s) = arg.as_expression()? else {
        return None;
    };
    let source = s.value.as_str().to_string();

    match &decl.id {
        BindingPattern::BindingIdentifier(binding_id) => {
            let name = binding_id.name.as_str();
            if properties.contains(name) {
                Some(format!("import * as {name} from \"{source}\";"))
            } else {
                Some(format!("import {name} from \"{source}\";"))
            }
        }
        BindingPattern::ObjectPattern(obj) => {
            let names: Vec<String> = obj
                .properties
                .iter()
                .filter_map(|prop| {
                    if let BindingPattern::BindingIdentifier(id) = &prop.value {
                        Some(id.name.as_str().to_string())
                    } else {
                        None
                    }
                })
                .collect();
            if names.is_empty() {
                None
            } else {
                Some(format!(
                    "import {{ {} }} from \"{}\";",
                    names.join(", "),
                    source
                ))
            }
        }
        _ => None,
    }
}

/// Collect all `foo` from `foo.bar` property access expressions.
fn collect_property_access_names<'a>(program: &Program<'a>) -> HashSet<String> {
    let mut collector = PropertyAccessCollector {
        names: HashSet::new(),
    };
    collector.visit_program(program);
    collector.names
}

struct PropertyAccessCollector {
    names: HashSet<String>,
}

impl<'a> Visit<'a> for PropertyAccessCollector {
    fn visit_static_member_expression(&mut self, it: &oxc::ast::ast::StaticMemberExpression<'a>) {
        if let Expression::Identifier(ident) = &it.object {
            self.names.insert(ident.name.as_str().to_string());
        }
        Visit::visit_expression(self, &it.object);
    }
}

/// Remove exports from a source file (but not from the entry file).
///
/// Mirrors the `esmExportRemoveHandler` call.
pub fn remove_exports(file: &str, content: &str) -> String {
    with_parsed_program(file, content, |program| {
        let source_text = program.source_text;

        let mut result = String::with_capacity(content.len());

        for stmt in &program.body {
            match stmt {
                // Case 1: `export function/class/interface/type/enum/const ...`
                // → unwrap the export wrapper, keeping the inner declaration.
                Statement::ExportDeclaration(export_decl) => {
                    // Extract the inner declaration's source text
                    let text = export_decl.declaration.span().source_text(source_text);
                    result.push_str(text);
                    result.push('\n');
                }

                // Case 2: `export { foo }`, `export { foo } from "bar"`,
                // or `export * from "bar"` / `export * as ns from "bar"` → remove.
                Statement::ExportNamedDeclaration(_)
                | Statement::ExportFromDeclaration(_)
                | Statement::ExportAllDeclaration(_) => {
                    continue;
                }

                // Case 3: `export default <identifier>` → remove.
                // `export default function foo() {}` → `function foo() {}`
                // `export default <expression>` → keep as expression statement.
                Statement::ExportDefaultDeclaration(export_default) => {
                    match &export_default.declaration {
                        // `export default function foo() {}` → `function foo() {}`
                        ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                            let text = func.span().source_text(source_text);
                            result.push_str(text);
                            result.push('\n');
                        }
                        // `export default class Foo {}` → `class Foo {}`
                        ExportDefaultDeclarationKind::ClassDeclaration(cls) => {
                            let text = cls.span().source_text(source_text);
                            result.push_str(text);
                            result.push('\n');
                        }
                        // `export default Foo` (identifier) → remove.
                        ExportDefaultDeclarationKind::Identifier(_) => continue,
                        // `export default <expression>` → keep as expression statement.
                        expr_kind => {
                            let text = expr_kind.span().source_text(source_text);
                            // Wrap as expression statement (add semicolon if needed)
                            result.push_str(text);
                            if !text.ends_with(';') {
                                result.push(';');
                            }
                            result.push('\n');
                        }
                    }
                }

                // Case 4: `export = foo` (TS) → remove.
                Statement::TSExportAssignment(_) | Statement::TSNamespaceExportDeclaration(_) => {
                    continue;
                }

                // Non-module statements: keep as-is.
                _ => {
                    let text = stmt.span().source_text(source_text);
                    result.push_str(text);
                    result.push('\n');
                }
            }
        }

        result
    })
}
