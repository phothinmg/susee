//! Unused code elimination.
//!
//! Ported from `src/nodejs/bundler/lib/unusedCode.ts`.
//!
//! Removes unused top-level declarations from a bundled source string:
//! - Removes unused named import specifiers.
//! - Removes entire import declarations when an unused default or namespace import is present.
//! - Removes function and class declarations when their name is unused.
//! - Removes entire variable statements when none of the declared identifiers are used.

use std::collections::{HashMap, HashSet};

use oxc::ast::ast::{
    BindingPattern, ImportDeclaration, ImportDeclarationSpecifier, Statement, VariableDeclaration,
};
use oxc::ast_visit::Visit;
use oxc::span::GetSpan;

use super::helpers::with_parsed_program;

/// Options for unused code elimination.
#[derive(Debug, Clone)]
pub struct ClearUnusedOptions {
    /// Treat exported symbols as used (default: true).
    pub treat_exports_as_used: bool,
}

impl Default for ClearUnusedOptions {
    fn default() -> Self {
        Self {
            treat_exports_as_used: true,
        }
    }
}

/// Collect all binding names from a binding pattern.
fn collect_binding_names(pattern: &BindingPattern<'_>, out: &mut Vec<String>) {
    match pattern {
        BindingPattern::BindingIdentifier(id) => {
            out.push(id.name.as_str().to_string());
        }
        BindingPattern::ObjectPattern(obj) => {
            for prop in &obj.properties {
                collect_binding_names(&prop.value, out);
            }
        }
        BindingPattern::ArrayPattern(arr) => {
            for elem in &arr.elements {
                if let Some(elem) = elem {
                    collect_binding_names(elem, out);
                }
            }
        }
        BindingPattern::AssignmentPattern(assign) => {
            collect_binding_names(&assign.left, out);
        }
    }
}

/// A read-only visitor that collects defined names and used identifiers.
#[derive(Default)]
struct CollectVisitor {
    /// Maps name → { exported: bool }
    defined: HashMap<String, bool>,
    /// Set of used identifier names.
    used: HashSet<String>,
}

impl<'a> Visit<'a> for CollectVisitor {
    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        if let Some(specifiers) = &it.specifiers {
            for spec in specifiers {
                match spec {
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                        self.defined
                            .insert(s.local.name.as_str().to_string(), false);
                    }
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => {
                        self.defined
                            .insert(s.local.name.as_str().to_string(), false);
                    }
                    ImportDeclarationSpecifier::ImportSpecifier(s) => {
                        self.defined
                            .insert(s.local.name.as_str().to_string(), false);
                    }
                }
            }
        }
    }

    fn visit_ts_import_equals_declaration(
        &mut self,
        it: &oxc::ast::ast::TSImportEqualsDeclaration<'a>,
    ) {
        self.defined.insert(it.id.name.as_str().to_string(), false);
    }

    fn visit_variable_declaration(&mut self, it: &VariableDeclaration<'a>) {
        for decl in &it.declarations {
            let mut names = Vec::new();
            collect_binding_names(&decl.id, &mut names);
            for name in names {
                self.defined.insert(name, false);
            }
            // Walk the initializer so identifier references inside it
            // (e.g. `path` in `const x = path.join(...)`) are collected as "used".
            if let Some(init) = &decl.init {
                Visit::visit_expression(self, init);
            }
        }
    }

    fn visit_function(
        &mut self,
        it: &oxc::ast::ast::Function<'a>,
        _flags: oxc::syntax::scope::ScopeFlags,
    ) {
        if let Some(id) = &it.id {
            self.defined.insert(id.name.as_str().to_string(), false);
        }
        // Walk parameters so identifier references in default values / type
        // annotations are collected, then walk the body.
        for param in &it.params.items {
            Visit::visit_formal_parameter(self, param);
        }
        if let Some(body) = &it.body {
            Visit::visit_function_body(self, body);
        }
    }

    fn visit_class(&mut self, it: &oxc::ast::ast::Class<'a>) {
        if let Some(id) = &it.id {
            self.defined.insert(id.name.as_str().to_string(), false);
        }
        // Walk class body manually
        Visit::visit_class_body(self, &it.body);
    }

    fn visit_identifier_reference(&mut self, it: &oxc::ast::ast::IdentifierReference<'a>) {
        self.used.insert(it.name.as_str().to_string());
    }

    fn visit_export_named_declaration(&mut self, it: &oxc::ast::ast::ExportNamedDeclaration<'a>) {
        // Mark exported names as exported in the defined map
        for spec in &it.specifiers {
            if let oxc::ast::ast::ModuleExportName::IdentifierReference(id) = &spec.local {
                if let Some(exported) = self.defined.get_mut(id.name.as_str()) {
                    *exported = true;
                }
            }
        }
    }
}

/// Remove unused top-level declarations from source code.
///
/// Mirrors `cleanUnusedCode` / the default export from `unusedCode.ts`.
pub fn clean_unused_code(content: &str, file: &str, options: ClearUnusedOptions) -> String {
    with_parsed_program(file, content, |program| {
        // Phase 1: Collect defined names and used identifiers.
        let mut collector = CollectVisitor::default();
        collector.visit_program(program);

        // Determine unused names.
        let mut unused: HashSet<String> = HashSet::new();
        for (name, exported) in &collector.defined {
            if collector.used.contains(name) {
                continue;
            }
            if options.treat_exports_as_used && *exported {
                continue;
            }
            unused.insert(name.clone());
        }

        // Phase 2: Build output by removing only the spans of unused
        // statements, preserving comments and whitespace between statements
        // (e.g. the `//src/...` file-marker comments added by merge_content).
        //
        // Collect the byte ranges of statements to remove.
        let mut remove_ranges: Vec<(usize, usize)> = Vec::new();
        for stmt in &program.body {
            if !should_keep_statement(stmt, &unused) {
                remove_ranges.push((stmt.span().start as usize, stmt.span().end as usize));
            }
        }

        // Build the result by copying the original source text, skipping
        // the removed ranges. We also trim trailing whitespace left behind
        // by a removal on the same line.
        let bytes = content.as_bytes();
        let mut result = String::with_capacity(content.len());
        let mut cursor = 0;
        for (start, end) in &remove_ranges {
            // Copy everything before this removal.
            if *start > cursor {
                result.push_str(&content[cursor..*start]);
            }
            cursor = *end;
            // Skip a following newline so we don't leave a blank line.
            if cursor < bytes.len() && bytes[cursor] == b'\n' {
                cursor += 1;
            }
        }
        // Copy the remainder.
        if cursor < content.len() {
            result.push_str(&content[cursor..]);
        }

        result
    })
}

/// Determine whether a statement should be kept based on the unused set.
fn should_keep_statement(stmt: &Statement<'_>, unused: &HashSet<String>) -> bool {
    match stmt {
        // Import declarations
        Statement::ImportDeclaration(import_decl) => {
            if let Some(specifiers) = &import_decl.specifiers {
                // Check each specifier:
                // - Default/namespace: if unused → remove entire import
                // - Named: if any is used → keep entire import
                let mut has_used_named = false;
                for spec in specifiers {
                    match spec {
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
                            if unused.contains(s.local.name.as_str()) {
                                return false;
                            }
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => {
                            if unused.contains(s.local.name.as_str()) {
                                return false;
                            }
                        }
                        ImportDeclarationSpecifier::ImportSpecifier(s) => {
                            if !unused.contains(s.local.name.as_str()) {
                                has_used_named = true;
                            }
                        }
                    }
                }
                // Keep if any named specifier is used, or if there's a
                // default/namespace import that wasn't removed above.
                has_used_named || !specifiers.is_empty()
            } else {
                // Side-effect import: keep
                true
            }
        }

        // Function/Class declarations
        Statement::FunctionDeclaration(func) => {
            if let Some(id) = &func.id {
                !unused.contains(id.name.as_str())
            } else {
                true
            }
        }
        Statement::ClassDeclaration(cls) => {
            if let Some(id) = &cls.id {
                !unused.contains(id.name.as_str())
            } else {
                true
            }
        }

        // Variable declarations
        Statement::VariableDeclaration(var_decl) => {
            let mut names = Vec::new();
            for decl in &var_decl.declarations {
                collect_binding_names(&decl.id, &mut names);
            }
            names.iter().any(|n| !unused.contains(n))
        }

        // Export declarations: keep (they wrap declarations)
        Statement::ExportDeclaration(_) => true,
        Statement::ExportDefaultDeclaration(_) => true,
        Statement::ExportNamedDeclaration(_) => true,
        Statement::ExportFromDeclaration(_) => true,

        _ => true,
    }
}
