//! JSON module resolution.
//!
//! Ported from `src/nodejs/bundler/lib/resolveJSON.ts`.
//!
//! Converts `.json` dependency files into ESM modules by:
//! 1. Wrapping JSON content in `const __jsonModule__xxx = {...}; export default __jsonModule__xxx;`
//! 2. Renaming default imports that reference JSON modules to use the generated variable name.
//! 3. Renaming usages of those default imports throughout the code.

use std::collections::HashMap;
use std::path::Path;

use oxc::ast::ast::{ImportDeclarationSpecifier, Program, Statement};

use super::helpers::with_parsed_program;
use super::types::NamesSet;
use crate::dependencies::types::{DepsFile, ModuleType, ValidExts};

const JSON_PREFIX: &str = "__jsonModule__";

/// Convert a file path to a valid identifier for the JSON module variable name.
fn to_identifier(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '$' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let starts_valid = cleaned
        .chars()
        .next()
        .is_some_and(|c| c.is_alphanumeric() || c == '_' || c == '$');
    if starts_valid {
        format!("{JSON_PREFIX}{cleaned}")
    } else {
        format!("{JSON_PREFIX}_{cleaned}")
    }
}

/// Generate ESM code for a JSON module: `const varName = {...}; export default varName`.
fn to_json_module_code(var_name: &str, content: &str, file: &str) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(content)
        .map_err(|_| format!("Invalid JSON syntax in dependency file: {file}"))?;
    let json_object = serde_json::to_string(&parsed).unwrap();
    Ok(format!(
        "const {var_name} = {json_object};\nexport default {var_name}"
    ))
}

/// Resolve JSON modules in the dependency tree, converting them to ESM.
///
/// Mirrors `resolveJSONHandler` from `resolveJSON.ts`.
/// Returns the updated deps and the export name map.
fn resolve_json_handler(deps: Vec<DepsFile>) -> Result<(Vec<DepsFile>, Vec<NamesSet>), String> {
    let mut scoped_name_count: HashMap<String, usize> = HashMap::new();
    let mut export_name_map: Vec<NamesSet> = Vec::new();

    let mut next_deps = Vec::with_capacity(deps.len());
    for dep in deps {
        if dep.module_type != ModuleType::Json || dep.file_ext != ValidExts::Json {
            next_deps.push(dep);
            continue;
        }

        let file_name = Path::new(&dep.file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let file_key = super::helpers::get_file_key(&dep.file);
        let key_name = to_identifier(&file_key);
        let count = scoped_name_count.get(&key_name).copied().unwrap_or(0);
        let json_var_name = if count == 0 {
            key_name.clone()
        } else {
            format!("{key_name}_{}", count + 1)
        };
        scoped_name_count.insert(key_name, count + 1);

        export_name_map.push(NamesSet {
            base: json_var_name.clone(),
            file: file_name,
            new_name: json_var_name.clone(),
            is_ed: true,
        });

        let new_content = to_json_module_code(&json_var_name, &dep.content, &dep.file)?;

        next_deps.push(DepsFile {
            file: dep.file,
            content: new_content,
            bytes: dep.bytes,
            module_type: ModuleType::Esm,
            file_ext: dep.file_ext,
            is_jsx: dep.is_jsx,
            is_entry: dep.is_entry,
        });
    }

    Ok((next_deps, export_name_map))
}

/// Find import default specifiers that reference JSON modules and collect
/// (old_name, new_name) replacement pairs.
fn collect_json_import_replacements(
    program: &Program<'_>,
    export_name_map: &[NamesSet],
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

/// Main entry point for JSON module resolution.
///
/// Mirrors `jsonModuleHandlers` from `resolveJSON.ts`.
///
/// This performs three steps:
/// 1. Convert JSON files to `const __jsonModule__xxx = {...}; export default __jsonModule__xxx`.
/// 2. Rename default import bindings that reference JSON modules.
/// 3. Rename usages of those bindings — but only in specific AST contexts
///    (call expressions, member expressions, new expressions, export
///    specifiers) to avoid clobbering unrelated local variables that happen
///    to share the same name.
pub fn json_module_handlers(deps: Vec<DepsFile>) -> Result<Vec<DepsFile>, String> {
    let (deps, export_name_map) = resolve_json_handler(deps)?;

    // For each non-JSON file, find imports from JSON modules and rename them.
    let mut result = Vec::with_capacity(deps.len());
    for dep in &deps {
        if dep.module_type == ModuleType::Json || dep.file_ext == ValidExts::Json {
            result.push(dep.clone());
            continue;
        }

        // Step 2: Collect (old_name, new_name) pairs from import declarations.
        let replacements = with_parsed_program(&dep.file, &dep.content, |program| {
            collect_json_import_replacements(program, &export_name_map)
        });

        if replacements.is_empty() {
            result.push(dep.clone());
            continue;
        }

        // Steps 2a + 3: Rename both the import declaration bindings AND the
        // usages in call/member/new contexts, all via AST span-based
        // replacement so unrelated local variables sharing the same name
        // are not clobbered.
        let content = rename_json_imports_and_usages_ast(&dep.file, &dep.content, &replacements);

        result.push(DepsFile {
            file: dep.file.clone(),
            content,
            bytes: dep.bytes,
            module_type: dep.module_type,
            file_ext: dep.file_ext,
            is_jsx: dep.is_jsx,
            is_entry: dep.is_entry,
        });
    }

    Ok(result)
}

/// AST-based rename of JSON import bindings and their usages.
///
/// Mirrors `jsonModuleImportHandler` + `jsonModuleCallExpressionHandler` from
/// `resolveJSON.ts`.  Only renames identifiers at:
/// - Import declaration default specifiers (`import foo from` → `import newName from`)
/// - The callee of a `CallExpression` (`foo()` → `newName()`)
/// - The object of a `StaticMemberExpression` (`foo.bar` → `newName.bar`)
/// - The object of a `ComputedMemberExpression` (`foo[0]` → `newName[0]`)
/// - The callee of a `NewExpression` (`new foo()` → `new newName()`)
///
/// This avoids renaming unrelated local variables that share the same name.
fn rename_json_imports_and_usages_ast(
    file: &str,
    content: &str,
    replacements: &[(String, String)],
) -> String {
    use oxc::ast::ast::{Expression, ImportDeclarationSpecifier};
    use oxc::ast_visit::Visit;
    use oxc::span::Span;

    /// Collect byte spans of identifiers that should be renamed.
    struct UsageCollector<'a> {
        replacements: &'a [(String, String)],
        spans: Vec<(Span, String)>,
    }

    impl<'a> UsageCollector<'a> {
        fn lookup(&self, name: &str) -> Option<&String> {
            self.replacements
                .iter()
                .find(|(old, _)| old == name)
                .map(|(_, new)| new)
        }
    }

    impl<'a> Visit<'a> for UsageCollector<'a> {
        fn visit_import_declaration(&mut self, it: &oxc::ast::ast::ImportDeclaration<'a>) {
            if let Some(specifiers) = &it.specifiers {
                for spec in specifiers {
                    if let ImportDeclarationSpecifier::ImportDefaultSpecifier(default_spec) = spec {
                        if let Some(new_name) = self.lookup(default_spec.local.name.as_str()) {
                            self.spans.push((default_spec.local.span, new_name.clone()));
                        }
                    }
                }
            }
            oxc::ast_visit::walk::walk_import_declaration(self, it);
        }

        fn visit_call_expression(&mut self, it: &oxc::ast::ast::CallExpression<'a>) {
            if let Expression::Identifier(ident) = &it.callee {
                if let Some(new_name) = self.lookup(ident.name.as_str()) {
                    self.spans.push((ident.span, new_name.clone()));
                }
            }
            oxc::ast_visit::walk::walk_call_expression(self, it);
        }

        fn visit_static_member_expression(
            &mut self,
            it: &oxc::ast::ast::StaticMemberExpression<'a>,
        ) {
            if let Expression::Identifier(ident) = &it.object {
                if let Some(new_name) = self.lookup(ident.name.as_str()) {
                    self.spans.push((ident.span, new_name.clone()));
                }
            }
            oxc::ast_visit::walk::walk_static_member_expression(self, it);
        }

        fn visit_computed_member_expression(
            &mut self,
            it: &oxc::ast::ast::ComputedMemberExpression<'a>,
        ) {
            if let Expression::Identifier(ident) = &it.object {
                if let Some(new_name) = self.lookup(ident.name.as_str()) {
                    self.spans.push((ident.span, new_name.clone()));
                }
            }
            oxc::ast_visit::walk::walk_computed_member_expression(self, it);
        }

        fn visit_new_expression(&mut self, it: &oxc::ast::ast::NewExpression<'a>) {
            if let Expression::Identifier(ident) = &it.callee {
                if let Some(new_name) = self.lookup(ident.name.as_str()) {
                    self.spans.push((ident.span, new_name.clone()));
                }
            }
            oxc::ast_visit::walk::walk_new_expression(self, it);
        }
    }

    with_parsed_program(file, content, |program| {
        let mut collector = UsageCollector {
            replacements,
            spans: Vec::new(),
        };
        collector.visit_program(program);

        if collector.spans.is_empty() {
            return content.to_string();
        }

        // Sort spans in descending order so we can replace from end to start
        // without shifting byte offsets.
        collector.spans.sort_by(|a, b| b.0.start.cmp(&a.0.start));

        let mut result = content.to_string();
        for (span, new_name) in &collector.spans {
            let start = span.start as usize;
            let end = span.end as usize;
            if start <= result.len() && end <= result.len() {
                result.replace_range(start..end, new_name);
            }
        }

        result
    })
}

/// Replace all occurrences of identifier `old` with `new` in source text.
///
/// Uses simple word-boundary matching to avoid replacing substrings.
pub fn replace_identifier_pub(text: &str, old: &str, new: &str) -> String {
    if old == new {
        return text.to_string();
    }
    let mut result = String::with_capacity(text.len());
    let bytes = text.as_bytes();
    let old_bytes = old.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i..].starts_with(old_bytes) {
            // Check word boundary before
            let before_ok = i == 0 || !is_ident_char(bytes[i - 1]);
            // Check word boundary after
            let after_idx = i + old_bytes.len();
            let after_ok = after_idx >= bytes.len() || !is_ident_char(bytes[after_idx]);
            if before_ok && after_ok {
                result.push_str(new);
                i = after_idx;
                continue;
            }
        }
        result.push(bytes[i] as char);
        i += 1;
    }
    result
}

/// Check if a byte is a valid identifier character (alphanumeric or `_` or `$`).
fn is_ident_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
}
