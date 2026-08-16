//! Collect module specifiers from JS/TS source using the oxc parser and AST visitor.
//!
//! Handles:
//! - `import foo from "foo"` / `import "foo"`
//! - `import foo = require("foo")` (TS import-equals)
//! - `await import("foo")` (dynamic import)
//! - `require("foo")` / `require("foo").bar` (CommonJS)

use oxc::allocator::Allocator;
use oxc::ast::ast::{
    Argument, AwaitExpression, CallExpression, ExportAllDeclaration, ExportFromDeclaration,
    Expression, ImportDeclaration, ImportExpression, StringLiteral, TSExternalModuleReference,
    TSImportEqualsDeclaration,
};
use oxc::ast_visit::Visit;
use oxc::parser::Parser;
use oxc::span::SourceType;

/// Collect all module specifiers from JS/TS `source` text.
///
/// `file_path` is used only to determine the [`SourceType`] (e.g. `.tsx` → TSX).
/// Returns a list of module specifier strings (e.g. `"./foo"`, `"react"`,
/// `"node:fs"`).
pub fn collect_module_specifiers(source: &str, file_path: &std::path::Path) -> Vec<String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let parser_return = Parser::new(&allocator, source, source_type).parse();

    let mut visitor = SpecifierCollector::default();
    visitor.visit_program(&parser_return.program);
    visitor.specifiers
}

#[derive(Default)]
struct SpecifierCollector {
    specifiers: Vec<String>,
}

impl<'a> Visit<'a> for SpecifierCollector {
    // import foo from "foo"
    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        self.specifiers.push(it.source.value.as_str().to_string());
        // Do not walk children — we already captured the source.
    }

    // export * from "foo" / export * as bar from "foo"
    fn visit_export_all_declaration(&mut self, it: &ExportAllDeclaration<'a>) {
        self.specifiers.push(it.source.value.as_str().to_string());
    }

    // export { foo } from "foo" (re-export)
    fn visit_export_from_declaration(&mut self, it: &ExportFromDeclaration<'a>) {
        self.specifiers.push(it.source.value.as_str().to_string());
    }

    // import foo = require("foo")
    fn visit_ts_import_equals_declaration(&mut self, it: &TSImportEqualsDeclaration<'a>) {
        if let oxc::ast::ast::TSModuleReference::ExternalModuleReference(ext) = &it.module_reference
        {
            self.visit_ts_external_module_reference(ext);
        }
    }

    fn visit_ts_external_module_reference(&mut self, it: &TSExternalModuleReference<'a>) {
        self.specifiers
            .push(it.expression.value.as_str().to_string());
    }

    // await import("foo") — the dynamic import is an `ImportExpression`.
    // `await import("foo")` wraps it in `AwaitExpression`.
    fn visit_await_expression(&mut self, it: &AwaitExpression<'a>) {
        if let Expression::ImportExpression(import_expr) = &it.argument {
            self.visit_import_expression(import_expr);
        } else {
            // Other await expressions: walk normally.
            self.visit_expression(&it.argument);
        }
    }

    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        if let Some(spec) = string_from_expression(&it.source) {
            self.specifiers.push(spec);
        }
    }

    // require("foo") and require("foo").bar
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if is_require_call(it) {
            if let Some(spec) = first_string_argument(it) {
                self.specifiers.push(spec);
            }
            // Don't walk children for require calls — we already captured it.
            return;
        }
        // Otherwise walk normally to find nested require/import expressions.
        self.visit_expression(&it.callee);
        self.visit_arguments(&it.arguments);
    }
}

/// Check whether a call expression is `require(...)`.
fn is_require_call(call: &CallExpression<'_>) -> bool {
    if let Expression::Identifier(ident) = &call.callee {
        return ident.name.as_str() == "require";
    }
    false
}

/// Extract the first string-literal argument from a call expression.
fn first_string_argument(call: &CallExpression<'_>) -> Option<String> {
    let arg = call.arguments.first()?;
    match arg {
        Argument::SpreadElement(_) => None,
        other => {
            // `Argument` inherits `Expression` variants via `INHERIT(Expression)`.
            // Use `as_expression` to get the underlying expression.
            other
                .as_expression()
                .and_then(|expr| string_from_expression(expr))
        }
    }
}

/// Extract a string value from a string-literal expression.
fn string_from_expression(expr: &Expression<'_>) -> Option<String> {
    match expr {
        Expression::StringLiteral(s) => Some(string_literal_value(s)),
        _ => None,
    }
}

/// Get the value of a `StringLiteral`.
fn string_literal_value(s: &StringLiteral<'_>) -> String {
    s.value.as_str().to_string()
}
