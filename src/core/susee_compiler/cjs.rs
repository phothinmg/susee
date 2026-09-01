//! ESM → CommonJS converter.
//!
//! Lowers ECMAScript module syntax (`import` / `export`) to CommonJS
//! (`require` / `module.exports` / `exports.x`) and, when the input is
//! TypeScript, strips type annotations in the same pass.
//!
//! The interop helpers (`__importDefault`, `__importStar`, `__createBinding`,
//! `__setModuleDefault`) are inlined at the top of the output, mirroring the
//! `helper.js` file used by the TypeScript port — but only the helpers that
//! the converted module actually needs are emitted.

use oxc::allocator::Allocator;
use oxc::ast::ast::ImportMeta;
use oxc::ast::ast::{
    Declaration, ExportAllDeclaration, ExportDefaultDeclaration, ExportDefaultDeclarationKind,
    ExportFromDeclaration, ExportNamedDeclaration, Expression, ImportDeclaration,
    ImportDeclarationSpecifier, ModuleExportName, Program, Statement, VariableDeclaration,
};
use oxc::ast_visit::Visit;
use oxc::codegen::{Codegen, Context, Gen};
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
use oxc::span::SourceType;
use oxc::transformer::{TransformOptions, Transformer};
use std::path::Path;

// ---------------------------------------------------------------------------
// Runtime helpers (inlined verbatim from `helper.js`).
// ---------------------------------------------------------------------------

const HELPER_CREATE_BINDING: &str = r#"var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() { return m[k]; } };
  }
  Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  o[k2] = m[k];
}));"#;

const HELPER_SET_MODULE_DEFAULT: &str = r#"var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : (function(o, v) {
  o["default"] = v;
}));"#;

const HELPER_IMPORT_STAR: &str = r#"var __importStar = (this && this.__importStar) || (function(mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
  }
  __setModuleDefault(result, mod);
  return result;
});"#;

const HELPER_IMPORT_DEFAULT: &str = r#"var __importDefault = (this && this.__importDefault) || (function(mod) {
  return (mod && mod.__esModule) ? mod : { "default": mod };
});"#;

/// CJS shim for `import.meta`.
///
/// `import.meta` is an ESM-only construct. In CommonJS we approximate it with
/// an object whose `url` property mirrors `require("url").pathToFileURL(__filename).href`,
/// matching the behaviour of the TypeScript compiler's `module: CommonJS` output.
const HELPER_IMPORT_META: &str =
    "var __import_meta = { url: require(\"url\").pathToFileURL(__filename).href };";

/// Strip TypeScript type annotations from `source_code`, leaving ESM intact.
///
/// Runs oxc's transformer with default [`TransformOptions`] (which only strips
/// types — no module lowering) and returns the JavaScript source text.
fn strip_types(source_code: &str, source_type: SourceType, file_path: Option<String>) -> String {
    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, source_code, source_type);
    let parsed = parser.parse();
    if parsed.panicked {
        let diags = parsed
            .diagnostics
            .iter()
            .map(|d| format!("{d}"))
            .collect::<Vec<_>>()
            .join("\n");
        panic!("oxc parse error: {diags}");
    }
    let mut program = parsed.program;
    // Only run the transformer when the input is TypeScript.
    if source_type.is_typescript() {
        let scoping = SemanticBuilder::new_compiler()
            .build(&program)
            .semantic
            .into_scoping();
        let entry_path = file_path.unwrap_or_default();
        let source_path = Path::new(&entry_path);
        let options = TransformOptions::default();
        let transformed = Transformer::new(&allocator, source_path, &options)
            .build_with_scoping(scoping, &mut program);
        if transformed.diagnostics.has_errors() {
            let diags = transformed
                .diagnostics
                .iter()
                .map(|d| format!("{d}"))
                .collect::<Vec<_>>()
                .join("\n");
            panic!("oxc transform error: {diags}");
        }
    }
    Codegen::new().build(&program).code
}

/// Tracks which interop helpers are required by the module.
///
/// Each field corresponds to one runtime helper that may be inlined at the
/// top of the generated CJS output. Fields are set during [`scan_helper_usage`]
/// and [`convert_import`] / [`convert_export_from`] / [`convert_export_all`].
///
/// `__importStar` implicitly requires `__createBinding` and
/// `__setModuleDefault`; this dependency is resolved in [`scan_helper_usage`]
/// and [`assemble_header`].
#[derive(Default)]
struct HelperUsage {
    needs_create_binding: bool,
    needs_set_module_default: bool,
    needs_import_star: bool,
    needs_import_default: bool,
    needs_import_meta: bool,
}

/// A normalised view of an import declaration.
///
/// Produced by [`convert_import`] from an [`ImportDeclaration`] AST node.
/// `default_local` is `Some` when the import has a default specifier
/// (`import x from …`), `namespace_local` for `import * as ns from …`, and
/// `named` holds the `(imported, local)` pairs for named specifiers.
/// `bare` is `true` for side-effect-only imports (`import "foo"`).
struct ImportInfo {
    /// `import x from "foo"` — local binding name.
    default_local: Option<String>,
    /// `import * as ns from "foo"` — namespace binding name.
    namespace_local: Option<String>,
    /// `import { a, b as c } from "foo"` — (imported, local) pairs.
    named: Vec<(String, String)>,
    /// `import "foo"` (no specifiers) — side-effect import.
    bare: bool,
}

/// Print an [`ImportDeclaration`] into a string of CJS `require` lines.
///
/// Emits the interop calls (`__importDefault` / `__importStar`) and marks
/// which helpers were used via `usage`.
fn convert_import(import: &ImportDeclaration<'_>, usage: &mut HelperUsage, out: &mut String) {
    let source = import.source.value.as_str();
    let specifiers = import.specifiers.as_ref();

    let mut info = ImportInfo {
        default_local: None,
        namespace_local: None,
        named: Vec::new(),
        bare: true,
    };

    if let Some(specs) = specifiers {
        if !specs.is_empty() {
            info.bare = false;
        }
        for spec in specs {
            match spec {
                ImportDeclarationSpecifier::ImportDefaultSpecifier(d) => {
                    info.default_local = Some(d.local.name.as_str().to_string());
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(ns) => {
                    info.namespace_local = Some(ns.local.name.as_str().to_string());
                }
                ImportDeclarationSpecifier::ImportSpecifier(s) => {
                    let imported = match &s.imported {
                        ModuleExportName::IdentifierName(id) => id.name.as_str().to_string(),
                        ModuleExportName::IdentifierReference(id) => id.name.as_str().to_string(),
                        ModuleExportName::StringLiteral(lit) => {
                            format!("\"{}\"", lit.value.as_str())
                        }
                    };
                    let local = s.local.name.as_str().to_string();
                    info.named.push((imported, local));
                }
            }
        }
    }

    if info.bare {
        // Side-effect import: `require("foo");`
        out.push_str(&format!("require(\"{}\");\n", source));
        return;
    }

    // Generate a unique require var name for this module.
    let require_var = format!("_{}", sanitize_ident(source));

    let has_default = info.default_local.is_some();
    let has_namespace = info.namespace_local.is_some();
    let has_named = !info.named.is_empty();

    // `import * as ns from "foo"` (only) → `var ns = __importStar(require("foo"));`
    if has_namespace && !has_default && !has_named {
        usage.needs_import_star = true;
        let local = info.namespace_local.as_ref().unwrap();
        out.push_str(&format!(
            "var {} = __importStar(require(\"{}\"));\n",
            local, source
        ));
        return;
    }

    // `import { a, b as c } from "foo"` (named-only, no default, no
    // namespace) → destructuring `var { a, b: c } = require("foo");`.
    //
    // This is the concise form requested for plain named imports such as
    // `import { EventEmitter } from "node:events"`. String-literal imported
    // names are preserved verbatim (quotes included), producing valid
    // computed-style destructuring like `var { "foo-bar": x } = …`.
    if has_named && !has_default && !has_namespace {
        out.push_str(&format!(
            "var {{ {} }} = require(\"{}\");\n",
            format_named_destructure(&info.named),
            source
        ));
        return;
    }

    // Default + named / namespace mix: emit a require var and derive bindings.
    if has_default {
        usage.needs_import_default = true;
        out.push_str(&format!(
            "var {} = __importDefault(require(\"{}\"));\n",
            require_var, source
        ));
        if let Some(local) = &info.default_local {
            out.push_str(&format!("var {} = {}.default;\n", local, require_var));
        }
    } else {
        out.push_str(&format!("var {} = require(\"{}\");\n", require_var, source));
    }

    if let Some(local) = &info.namespace_local {
        usage.needs_import_star = true;
        out.push_str(&format!("var {} = __importStar({});\n", local, require_var));
    }

    for (imported, local) in &info.named {
        out.push_str(&format!("var {} = {}.{};\n", local, require_var, imported));
    }
}

/// Format the `(imported, local)` pairs of a named import as the destructuring
/// target text used inside `var { … } = require(…)`.
///
/// When the imported and local names match, only one identifier is emitted
/// (`a`). When they differ, a rename is produced (`a: b`). String-literal
/// imported names (already quoted in `imported`) are passed through verbatim,
/// e.g. `var { "foo-bar": x } = …`.
fn format_named_destructure(named: &[(String, String)]) -> String {
    named
        .iter()
        .map(|(imported, local)| {
            if imported == local {
                imported.clone()
            } else {
                format!("{}: {}", imported, local)
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Convert `export { a, b };` into `exports.a = a;` / `exports.b = b;` lines.
///
/// Each specifier's `local` (the in-module binding) is assigned to
/// `exports.<exported>`. String-literal export names are supported.
fn convert_export_named(decl: &ExportNamedDeclaration<'_>, out: &mut String) {
    for spec in &decl.specifiers {
        let local = module_export_name_str(&spec.local);
        let exported = module_export_name_str(&spec.exported);
        out.push_str(&format!("exports.{} = {};\n", exported, local));
    }
}

/// Convert `export { a, b } from "foo";` into a `require` + `exports.x = …` block.
///
/// The source module is required via `__importDefault` (so `needs_import_default`
/// is set on `usage`). Each specifier becomes
/// `exports.<exported> = _<mod>.default.<imported>;`.
fn convert_export_from(
    decl: &ExportFromDeclaration<'_>,
    usage: &mut HelperUsage,
    out: &mut String,
) {
    let source = decl.source.value.as_str();
    let require_var = format!("_{}", sanitize_ident(source));
    usage.needs_import_default = true;
    out.push_str(&format!(
        "var {} = __importDefault(require(\"{}\"));\n",
        require_var, source
    ));
    for spec in &decl.specifiers {
        let imported = module_export_name_str(&spec.local);
        let exported = module_export_name_str(&spec.exported);
        out.push_str(&format!(
            "exports.{} = {}.default.{};\n",
            exported, require_var, imported
        ));
    }
}

/// Convert `export * from "foo"` or `export * as ns from "foo"` into CJS.
///
/// * `export * as ns from "foo"` → `exports.ns = __importStar(require("foo"));`
/// * `export * from "foo"` → copies all enumerable keys except `"default"`
///   onto `exports` via `Object.keys` + `Object.defineProperty`.
///
/// Sets `needs_import_star` (and transitively `needs_create_binding` /
/// `needs_set_module_default`) on `usage`.
fn convert_export_all(decl: &ExportAllDeclaration<'_>, usage: &mut HelperUsage, out: &mut String) {
    let source = decl.source.value.as_str();
    let require_var = format!("_{}", sanitize_ident(source));
    usage.needs_import_star = true;
    out.push_str(&format!(
        "var {} = __importStar(require(\"{}\"));\n",
        require_var, source
    ));
    match &decl.exported {
        Some(name) => {
            // `export * as ns from "foo"` → `exports.ns = _foo;`
            let exported = module_export_name_str(name);
            out.push_str(&format!("exports.{} = {};\n", exported, require_var));
        }
        None => {
            // `export * from "foo"` → copy all keys.
            out.push_str(&format!(
                "Object.keys({}).forEach(function(k) {{\n  if (k !== \"default\") Object.defineProperty(exports, k, {{ enumerable: true, get: function() {{ return {}[k]; }} }});\n}});\n",
                require_var, require_var
            ));
        }
    }
}

/// Convert `export default …` into the appropriate `module.exports.default = …`.
///
/// * Named function/class → print the declaration, then assign by name.
/// * Anonymous function/class → `module.exports.default = function(…) { … }`.
/// * Expression → `module.exports.default = <expression>;`.
fn convert_export_default(decl: &ExportDefaultDeclaration<'_>, out: &mut String) {
    match &decl.declaration {
        ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
            if let Some(name) = func.name() {
                let name = name.as_str();
                let mut sub = Codegen::new();
                func.print(&mut sub, Context::empty());
                out.push_str(&sub.into_source_text());
                out.push('\n');
                out.push_str(&format!("module.exports.default = {};\n", name));
            } else {
                // Anonymous: `module.exports.default = function () { … };`
                out.push_str("module.exports.default = function(");
                for (i, param) in func.params.items.iter().enumerate() {
                    if i > 0 {
                        out.push_str(", ");
                    }
                    let mut sub = Codegen::new();
                    param.pattern.print(&mut sub, Context::empty());
                    out.push_str(&sub.into_source_text());
                }
                out.push_str(") ");
                if let Some(body) = &func.body {
                    let mut sub = Codegen::new();
                    body.print(&mut sub, Context::empty());
                    out.push_str(&sub.into_source_text());
                }
                out.push_str(";\n");
            }
        }
        ExportDefaultDeclarationKind::ClassDeclaration(class) => {
            if let Some(name) = class.name() {
                let name = name.as_str();
                let mut sub = Codegen::new();
                class.print(&mut sub, Context::empty());
                out.push_str(&sub.into_source_text());
                out.push('\n');
                out.push_str(&format!("module.exports.default = {};\n", name));
            } else {
                let mut sub = Codegen::new();
                class.print(&mut sub, Context::empty());
                out.push_str("module.exports.default = ");
                out.push_str(&sub.into_source_text());
                out.push_str(";\n");
            }
        }
        // `export default <expression>;` → `module.exports.default = <expression>;`
        // The `INHERIT` variants are the `Expression` variants merged into this
        // enum; catch them all with a wildcard and print as an expression.
        _ => {
            // Re-print the declaration kind as an expression via codegen.
            let mut sub = Codegen::new();
            decl.declaration.print(&mut sub, Context::empty());
            let text = sub.into_source_text();
            out.push_str("module.exports.default = ");
            out.push_str(&text);
            out.push_str(";\n");
        }
    }
}

/// Convert `export <decl>` (variable / function / class) into CJS.
///
/// Prints the declaration without the `export` keyword, then appends
/// `exports.x = x;` for every binding declared in it (including destructuring
/// patterns handled by [`collect_binding_names`]). Type-only declarations
/// are already stripped by the TS transformer.
fn convert_export_declaration(decl: &oxc::ast::ast::ExportDeclaration<'_>, out: &mut String) {
    match &decl.declaration {
        Declaration::VariableDeclaration(var_decl) => {
            print_variable_declaration(var_decl, out);
            for d in &var_decl.declarations {
                collect_binding_names(&d.id, out);
            }
        }
        Declaration::FunctionDeclaration(func) => {
            print_function_declaration(func, out);
            if let Some(name) = func.name() {
                out.push_str(&format!("exports.{} = {};\n", name.as_str(), name.as_str()));
            }
        }
        Declaration::ClassDeclaration(class) => {
            print_class_declaration(class, out);
            if let Some(name) = class.name() {
                out.push_str(&format!("exports.{} = {};\n", name.as_str(), name.as_str()));
            }
        }
        // Type-only declarations are stripped by the TS transformer already.
        _ => {}
    }
}

/// Walk a [`BindingPattern`] and append `exports.<name> = <name>;` for each
/// identifier it declares.
///
/// Handles `BindingIdentifier`, `ObjectPattern` (including rest), and
/// `ArrayPattern`. Nested patterns recurse through
/// [`collect_binding_names_inner`].
fn collect_binding_names(pattern: &oxc::ast::ast::BindingPattern<'_>, out: &mut String) {
    use oxc::ast::ast::BindingPattern;
    match pattern {
        BindingPattern::BindingIdentifier(id) => {
            out.push_str(&format!(
                "exports.{} = {};\n",
                id.name.as_str(),
                id.name.as_str()
            ));
        }
        BindingPattern::ObjectPattern(obj) => {
            for prop in &obj.properties {
                if let Some(name) = prop.key.static_name() {
                    let name = name.to_string();
                    collect_binding_names_inner(&prop.value, &name, out);
                }
            }
            if let Some(rest) = &obj.rest {
                collect_binding_names(&rest.argument, out);
            }
        }
        BindingPattern::ArrayPattern(arr) => {
            for elem in arr.elements.iter().flatten() {
                collect_binding_names(elem, out);
            }
        }
        _ => {}
    }
}

/// Like [`collect_binding_names`] but uses `exported_name` (the object key)
/// as the `exports.` target for a plain `BindingIdentifier`.
///
/// This handles `const { a: b } = …` where the exported name is `a` but the
/// local binding is `b`, producing `exports.a = b;`.
fn collect_binding_names_inner(
    pattern: &oxc::ast::ast::BindingPattern<'_>,
    exported_name: &str,
    out: &mut String,
) {
    use oxc::ast::ast::BindingPattern;
    match pattern {
        BindingPattern::BindingIdentifier(id) => {
            out.push_str(&format!(
                "exports.{} = {};\n",
                exported_name,
                id.name.as_str()
            ));
        }
        _ => collect_binding_names(pattern, out),
    }
}

/// Print a [`VariableDeclaration`] via [`Codegen`] and append it to `out`,
/// ensuring a trailing `;`.
fn print_variable_declaration(decl: &VariableDeclaration<'_>, out: &mut String) {
    let mut sub = Codegen::new();
    decl.print(&mut sub, Context::empty());
    let mut text = sub.into_source_text();
    if !text.ends_with(';') {
        text.push(';');
    }
    out.push_str(&text);
    out.push('\n');
}

/// Print a [`Function`] declaration (without `export`) via [`Codegen`].
fn print_function_declaration(func: &oxc::ast::ast::Function<'_>, out: &mut String) {
    let mut sub = Codegen::new();
    func.print(&mut sub, Context::empty());
    out.push_str(&sub.into_source_text());
    out.push('\n');
}

/// Print a [`Class`] declaration (without `export`) via [`Codegen`].
fn print_class_declaration(class: &oxc::ast::ast::Class<'_>, out: &mut String) {
    let mut sub = Codegen::new();
    class.print(&mut sub, Context::empty());
    out.push_str(&sub.into_source_text());
    out.push('\n');
}

/// Convert a [`ModuleExportName`] to its string representation.
///
/// `IdentifierName` / `IdentifierReference` → the identifier text.
/// `StringLiteral` → the raw string value (without quotes).
fn module_export_name_str(name: &ModuleExportName<'_>) -> String {
    match name {
        ModuleExportName::IdentifierName(id) => id.name.as_str().to_string(),
        ModuleExportName::IdentifierReference(id) => id.name.as_str().to_string(),
        ModuleExportName::StringLiteral(lit) => lit.value.as_str().to_string(),
    }
}

/// Sanitise a module specifier (e.g. `"./foo-bar.js"`) into a valid JS
/// identifier fragment suitable for generated variable names like `_foo_bar_js`.
///
/// Replaces `/`, `-`, `.` with `_` and strips any remaining non-alphanumeric /
/// non-underscore characters.
fn sanitize_ident(spec: &str) -> String {
    spec.replace(['/', '-', '.'], "_")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect()
}

/// Assemble the CJS file header: inlined interop helpers (only those flagged
/// in `usage`), a `"use strict";` directive, and the `__esModule` marker.
///
/// Helper ordering matches the dependency chain: `__createBinding` and
/// `__setModuleDefault` before `__importStar` (which calls both), and
/// `__importDefault` last.
fn assemble_header(usage: &HelperUsage) -> String {
    let mut header = String::new();

    // "use strict" must be the very first directive in the file.
    header.push_str("\"use strict\";\n");

    if usage.needs_create_binding {
        header.push_str(HELPER_CREATE_BINDING);
        header.push('\n');
    }
    if usage.needs_set_module_default {
        header.push_str(HELPER_SET_MODULE_DEFAULT);
        header.push('\n');
    }
    if usage.needs_import_star {
        // __importStar depends on __createBinding and __setModuleDefault.
        header.push_str(HELPER_IMPORT_STAR);
        header.push('\n');
    }
    if usage.needs_import_default {
        header.push_str(HELPER_IMPORT_DEFAULT);
        header.push('\n');
    }
    if usage.needs_import_meta {
        header.push_str(HELPER_IMPORT_META);
        header.push('\n');
    }

    header.push_str("Object.defineProperty(exports, \"__esModule\", { value: true });\n");
    header
}

/// Recursively check whether an [`Expression`] contains an `await`.
///
/// This walks the AST structure of the expression rather than doing a
/// text-based scan, so string literals like `"await foo"` or template
/// literals containing the word `await` are NOT false-positives.
fn expression_has_await(expr: &Expression<'_>) -> bool {
    match expr {
        Expression::AwaitExpression(await_expr) => {
            // Check the await's argument too (e.g. `await foo()` → the
            // `foo()` part is already covered by returning true, but
            // nested awaits in the argument are also caught).
            true || expression_has_await(&await_expr.argument)
        }
        Expression::CallExpression(call) => {
            expression_has_await(&call.callee)
                || call.arguments.iter().any(|arg| argument_has_await(arg))
        }
        Expression::NewExpression(new_expr) => {
            expression_has_await(&new_expr.callee)
                || new_expr.arguments.iter().any(|arg| argument_has_await(arg))
        }
        Expression::BinaryExpression(bin) => {
            expression_has_await(&bin.left) || expression_has_await(&bin.right)
        }
        Expression::LogicalExpression(log) => {
            expression_has_await(&log.left) || expression_has_await(&log.right)
        }
        Expression::AssignmentExpression(assign) => {
            // Only the right side can contain await (assignment target
            // is a pattern, not an expression with await).
            expression_has_await(&assign.right)
        }
        Expression::ConditionalExpression(cond) => {
            expression_has_await(&cond.test)
                || expression_has_await(&cond.consequent)
                || expression_has_await(&cond.alternate)
        }
        Expression::SequenceExpression(seq) => seq.expressions.iter().any(expression_has_await),
        Expression::ArrayExpression(arr) => {
            arr.elements.iter().any(|el| match el {
                oxc::ast::ast::ArrayExpressionElement::SpreadElement(spread) => {
                    expression_has_await(&spread.argument)
                }
                oxc::ast::ast::ArrayExpressionElement::Elision(_) => false,
                // INHERIT(Expression) — the element IS an expression.
                _ => el.as_expression().is_some_and(expression_has_await),
            })
        }
        Expression::ObjectExpression(obj) => obj.properties.iter().any(|prop| match prop {
            oxc::ast::ast::ObjectPropertyKind::ObjectProperty(p) => expression_has_await(&p.value),
            oxc::ast::ast::ObjectPropertyKind::SpreadProperty(spread) => {
                expression_has_await(&spread.argument)
            }
        }),
        Expression::TemplateLiteral(tpl) => tpl.expressions.iter().any(expression_has_await),
        Expression::TaggedTemplateExpression(tagged) => {
            expression_has_await(&tagged.tag)
                || tagged.quasi.expressions.iter().any(expression_has_await)
        }
        Expression::ChainExpression(chain) => {
            // ChainExpression wraps optional call/member access.
            match &chain.expression {
                oxc::ast::ast::ChainElement::CallExpression(call) => {
                    expression_has_await(&call.callee)
                        || call.arguments.iter().any(|arg| argument_has_await(arg))
                }
                oxc::ast::ast::ChainElement::TSNonNullExpression(ts_nn) => {
                    expression_has_await(&ts_nn.expression)
                }
                // INHERIT(MemberExpression) — static or computed member.
                _ => false,
            }
        }
        Expression::ParenthesizedExpression(paren) => expression_has_await(&paren.expression),
        Expression::TSAsExpression(ts_as) => expression_has_await(&ts_as.expression),
        Expression::TSSatisfiesExpression(ts_sat) => expression_has_await(&ts_sat.expression),
        Expression::TSTypeAssertion(ts_assert) => expression_has_await(&ts_assert.expression),
        Expression::TSNonNullExpression(ts_nonnull) => expression_has_await(&ts_nonnull.expression),
        Expression::TSInstantiationExpression(ts_inst) => expression_has_await(&ts_inst.expression),
        Expression::YieldExpression(yield_expr) => yield_expr
            .argument
            .as_ref()
            .is_some_and(|arg| expression_has_await(arg)),
        // MemberExpression (static/computed), literals, identifiers, `this`,
        // `super`, arrow functions, function expressions, class expressions,
        // import expressions, import.meta, regex, bigint, boolean, null —
        // none of these directly contain `await` (their sub-expressions are
        // handled by the recursive cases above for the ones that matter).
        _ => false,
    }
}

/// Check whether an [`Argument`] (function argument) contains an `await`.
fn argument_has_await(arg: &oxc::ast::ast::Argument<'_>) -> bool {
    match arg {
        oxc::ast::ast::Argument::SpreadElement(spread) => expression_has_await(&spread.argument),
        _ => {
            // `Argument` inherits `Expression` variants — use `as_expression`
            // to get the underlying expression and check it.
            arg.as_expression()
                .is_some_and(|expr| expression_has_await(expr))
        }
    }
}

/// Recursively check whether a [`Statement`] contains a top-level `await`.
///
/// This walks the statement's expression bodies looking for
/// [`AwaitExpression`] nodes. It is used to decide whether the module body
/// must be wrapped in an `async` IIFE for CommonJS output.
fn statement_has_await(stmt: &Statement<'_>) -> bool {
    match stmt {
        Statement::ExpressionStatement(expr_stmt) => expression_has_await(&expr_stmt.expression),
        Statement::VariableDeclaration(var_decl) => var_decl.declarations.iter().any(|d| {
            d.init
                .as_ref()
                .is_some_and(|init| expression_has_await(init))
        }),
        Statement::ReturnStatement(ret) => ret
            .argument
            .as_ref()
            .is_some_and(|arg| expression_has_await(arg)),
        Statement::IfStatement(if_stmt) => {
            expression_has_await(&if_stmt.test)
                || statement_has_await(&if_stmt.consequent)
                || if_stmt
                    .alternate
                    .as_ref()
                    .is_some_and(|alt| statement_has_await(alt))
        }
        Statement::ThrowStatement(throw_stmt) => expression_has_await(&throw_stmt.argument),
        Statement::BlockStatement(block) => block.body.iter().any(statement_has_await),
        Statement::WhileStatement(while_stmt) => {
            expression_has_await(&while_stmt.test) || statement_has_await(&while_stmt.body)
        }
        Statement::DoWhileStatement(do_while) => {
            statement_has_await(&do_while.body) || expression_has_await(&do_while.test)
        }
        Statement::ForStatement(for_stmt) => {
            for_stmt.init.as_ref().is_some_and(|init| match init {
                oxc::ast::ast::ForStatementInit::VariableDeclaration(var_decl) => {
                    var_decl.declarations.iter().any(|d| {
                        d.init
                            .as_ref()
                            .is_some_and(|init| expression_has_await(init))
                    })
                }
                _ => init
                    .as_expression()
                    .is_some_and(|expr| expression_has_await(expr)),
            }) || for_stmt.test.as_ref().is_some_and(expression_has_await)
                || for_stmt.update.as_ref().is_some_and(expression_has_await)
                || statement_has_await(&for_stmt.body)
        }
        Statement::ForInStatement(for_in) => {
            expression_has_await(&for_in.right) || statement_has_await(&for_in.body)
        }
        Statement::ForOfStatement(for_of) => {
            expression_has_await(&for_of.right) || statement_has_await(&for_of.body)
        }
        Statement::SwitchStatement(switch) => {
            expression_has_await(&switch.discriminant)
                || switch.cases.iter().any(|case| {
                    case.test.as_ref().is_some_and(expression_has_await)
                        || case.consequent.iter().any(statement_has_await)
                })
        }
        Statement::LabeledStatement(labeled) => statement_has_await(&labeled.body),
        Statement::TryStatement(try_stmt) => {
            try_stmt.block.body.iter().any(statement_has_await)
                || try_stmt
                    .handler
                    .as_ref()
                    .is_some_and(|handler| handler.body.body.iter().any(statement_has_await))
                || try_stmt
                    .finalizer
                    .as_ref()
                    .is_some_and(|fin| fin.body.iter().any(statement_has_await))
        }
        _ => false,
    }
}

/// Check whether the program contains any top-level `await` expressions.
///
/// CommonJS does not support top-level `await`; when detected, the module
/// body is wrapped in an `async` IIFE so the `await` is valid.
fn program_has_top_level_await(program: &Program<'_>) -> bool {
    program.body.iter().any(statement_has_await)
}

/// Visitor that detects whether `import.meta` appears anywhere in the program.
struct ImportMetaDetector {
    found: bool,
}

impl<'a> Visit<'a> for ImportMetaDetector {
    fn visit_import_meta(&mut self, _it: &ImportMeta) {
        self.found = true;
    }
}

/// Check whether the program references `import.meta`.
///
/// `import.meta` is ESM-only; when detected the emitter inlines a
/// `__import_meta` shim and replaces all `import.meta` references with it.
fn program_has_import_meta(program: &Program<'_>) -> bool {
    let mut detector = ImportMetaDetector { found: false };
    detector.visit_program(program);
    detector.found
}

/// Pre-scan a program to determine which interop helpers are needed.
///
/// Walks top-level statements looking for import/export patterns that imply
/// specific helpers. Resolves the implicit `__importStar` → `__createBinding`
/// + `__setModuleDefault` dependency at the end.
fn scan_helper_usage(program: &Program<'_>) -> HelperUsage {
    let mut usage = HelperUsage::default();

    for stmt in &program.body {
        match stmt {
            Statement::ImportDeclaration(import) => {
                if let Some(specs) = &import.specifiers {
                    for spec in specs {
                        match spec {
                            ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => {
                                usage.needs_import_default = true;
                            }
                            ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => {
                                usage.needs_import_star = true;
                            }
                            ImportDeclarationSpecifier::ImportSpecifier(_) => {
                                // Named-only imports use a bare `require`, but if
                                // a default import co-exists we already set the flag.
                            }
                        }
                    }
                    let has_default = specs.iter().any(|s| {
                        matches!(s, ImportDeclarationSpecifier::ImportDefaultSpecifier(_))
                    });
                    if has_default {
                        usage.needs_import_default = true;
                    }
                }
            }
            Statement::ExportAllDeclaration(_) => {
                usage.needs_import_star = true;
            }
            Statement::ExportFromDeclaration(_) => {
                usage.needs_import_default = true;
            }
            _ => {}
        }
    }

    // __importStar pulls in __createBinding + __setModuleDefault.
    if usage.needs_import_star {
        usage.needs_create_binding = true;
        usage.needs_set_module_default = true;
    }

    usage
}

/// Convert ESM (or TypeScript) source code into CommonJS output.
///
/// This runs two passes:
/// 1. oxc's transformer (default [`TransformOptions`]) strips TypeScript type
///    annotations while keeping ESM module syntax intact.
/// 2. A custom AST walker lowers every `import` / `export` statement to
///    `require` / `module.exports` / `exports.x`, inlining the interop helper
///    functions (`__importDefault`, `__importStar`, `__createBinding`,
///    `__setModuleDefault`) at the top of the file — but only the ones the
///    module actually uses.
///
/// # Panics
///
/// Panics if the source fails to parse or the transformer reports errors.
///
pub fn emit_cjs(source_code: &str, source_type: SourceType, file_path: Option<String>) -> String {
    // 1. Strip TypeScript types (if any), keeping ESM.
    let js_code = strip_types(source_code, source_type, file_path);

    // 2. Parse the (now JS) source back into an AST.
    let allocator = Allocator::default();
    let js_source_type = SourceType::mjs();
    let parser = Parser::new(&allocator, &js_code, js_source_type);
    let parsed = parser.parse();
    if parsed.panicked {
        let diags = parsed
            .diagnostics
            .iter()
            .map(|d| format!("{d}"))
            .collect::<Vec<_>>()
            .join("\n");
        panic!("oxc parse error (post type-strip): {diags}");
    }
    let program = &parsed.program;

    // 3. Pre-scan to determine which helpers are needed.
    let mut usage = scan_helper_usage(program);

    // 4. Detect top-level `await` — CJS does not support it, so the module
    //    body must be wrapped in an `async` IIFE.
    let has_tla = program_has_top_level_await(program);

    // Detect `import.meta` — ESM-only, needs a CJS shim.
    if program_has_import_meta(program) {
        usage.needs_import_meta = true;
    }

    // 5. Assemble the output.
    let header = assemble_header(&usage);
    let mut out = String::with_capacity(js_code.len() + header.len());
    out.push_str(&header);

    if has_tla {
        out.push_str("(async () => {\n");
    }

    for stmt in &program.body {
        match stmt {
            // Import declarations → require calls.
            Statement::ImportDeclaration(import) => {
                convert_import(import, &mut usage, &mut out);
            }
            // export <decl>
            Statement::ExportDeclaration(export) => {
                convert_export_declaration(export, &mut out);
            }
            // export { a, b };
            Statement::ExportNamedDeclaration(export) => {
                convert_export_named(export, &mut out);
            }
            // export { a, b } from "foo";
            Statement::ExportFromDeclaration(export) => {
                convert_export_from(export, &mut usage, &mut out);
            }
            // export * from "foo"; / export * as ns from "foo";
            Statement::ExportAllDeclaration(export) => {
                convert_export_all(export, &mut usage, &mut out);
            }
            // export default …
            Statement::ExportDefaultDeclaration(export) => {
                convert_export_default(export, &mut out);
            }
            // TS module declarations are already handled by the transformer.
            Statement::TSExportAssignment(_) | Statement::TSNamespaceExportDeclaration(_) => {}
            // Regular statements — print as-is.
            _ => {
                let mut sub = Codegen::new();
                stmt.print(&mut sub, Context::empty());
                out.push_str(&sub.into_source_text());
                out.push('\n');
            }
        }
    }

    if has_tla {
        out.push_str("})();\n");
    }

    // Refresh the header in case later passes (export-from / export-all) added helpers.
    let final_header = assemble_header(&usage);
    out.replace_range(..header.len(), &final_header);

    // Replace `import.meta` with the CJS shim `__import_meta`.
    if usage.needs_import_meta {
        out = out.replace("import.meta", "__import_meta");
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── sanitize_ident ────────────────────────────────────────────────

    #[test]
    fn sanitize_ident_replaces_separators() {
        // `/`, `-`, `.` all become `_`.
        assert_eq!(sanitize_ident("foo-bar.js"), "foo_bar_js");
    }

    #[test]
    fn sanitize_ident_strips_non_alnum() {
        // `@` is stripped, `.` becomes `_` before filtering.
        assert_eq!(sanitize_ident("lib@1.0"), "lib1_0");
    }

    #[test]
    fn sanitize_ident_keeps_underscore() {
        assert_eq!(sanitize_ident("already_ok"), "already_ok");
    }

    // ─── module_export_name_str ────────────────────────────────────────

    // module_export_name_str is exercised indirectly by the full-pipeline
    // tests below (export named, export-from, etc.). Here we verify it through
    // a parsed `export { a as b }` specifier.
    #[test]
    fn module_export_name_str_from_parsed_export() {
        let allocator = Allocator::default();
        let program = Parser::new(
            &allocator,
            "const a = 1; export { a as b };",
            SourceType::mjs(),
        )
        .parse()
        .program;
        for stmt in &program.body {
            if let Statement::ExportNamedDeclaration(exp) = stmt {
                for spec in &exp.specifiers {
                    let local = module_export_name_str(&spec.local);
                    let exported = module_export_name_str(&spec.exported);
                    assert_eq!(local, "a");
                    assert_eq!(exported, "b");
                }
            }
        }
    }

    // ─── assemble_header ───────────────────────────────────────────────

    #[test]
    fn header_always_has_use_strict_and_esmodule() {
        let usage = HelperUsage::default();
        let header = assemble_header(&usage);
        assert!(header.contains("\"use strict\";"));
        assert!(header.contains("__esModule"));
        // No helpers needed → none should appear.
        assert!(!header.contains("__importDefault"));
        assert!(!header.contains("__importStar"));
    }

    #[test]
    fn header_includes_only_needed_helpers() {
        let mut usage = HelperUsage::default();
        usage.needs_import_default = true;
        let header = assemble_header(&usage);
        assert!(header.contains("__importDefault"));
        assert!(!header.contains("__importStar"));
        assert!(!header.contains("__createBinding"));
    }

    #[test]
    fn header_import_star_implies_create_binding_and_set_module_default() {
        // assemble_header emits in dependency order; import_star depends on
        // create_binding and set_module_default, but those must be requested
        // separately by scan_helper_usage. Here we verify that when all three
        // are set, they appear in the correct order.
        let mut usage = HelperUsage::default();
        usage.needs_import_star = true;
        usage.needs_create_binding = true;
        usage.needs_set_module_default = true;
        let header = assemble_header(&usage);
        let cb = header.find("__createBinding").unwrap();
        let smd = header.find("__setModuleDefault").unwrap();
        let is = header.find("__importStar").unwrap();
        assert!(cb < is, "create_binding must come before import_star");
        assert!(smd < is, "set_module_default must come before import_star");
    }

    // ─── scan_helper_usage ─────────────────────────────────────────────

    #[test]
    fn scan_bare_import_needs_no_helpers() {
        let allocator = Allocator::default();
        let program = Parser::new(&allocator, "import \"foo\";", SourceType::mjs())
            .parse()
            .program;
        let usage = scan_helper_usage(&program);
        assert!(!usage.needs_import_default);
        assert!(!usage.needs_import_star);
    }

    #[test]
    fn scan_default_import_sets_import_default() {
        let allocator = Allocator::default();
        let program = Parser::new(&allocator, "import x from \"foo\";", SourceType::mjs())
            .parse()
            .program;
        let usage = scan_helper_usage(&program);
        assert!(usage.needs_import_default);
        assert!(!usage.needs_import_star);
    }

    #[test]
    fn scan_namespace_import_sets_import_star_and_deps() {
        let allocator = Allocator::default();
        let program = Parser::new(
            &allocator,
            "import * as ns from \"foo\";",
            SourceType::mjs(),
        )
        .parse()
        .program;
        let usage = scan_helper_usage(&program);
        assert!(usage.needs_import_star);
        assert!(usage.needs_create_binding);
        assert!(usage.needs_set_module_default);
    }

    #[test]
    fn scan_export_all_sets_import_star() {
        let allocator = Allocator::default();
        let program = Parser::new(&allocator, "export * from \"foo\";", SourceType::mjs())
            .parse()
            .program;
        let usage = scan_helper_usage(&program);
        assert!(usage.needs_import_star);
    }

    #[test]
    fn scan_export_from_sets_import_default() {
        let allocator = Allocator::default();
        let program = Parser::new(&allocator, "export { a } from \"foo\";", SourceType::mjs())
            .parse()
            .program;
        let usage = scan_helper_usage(&program);
        assert!(usage.needs_import_default);
    }

    #[test]
    fn scan_named_only_import_needs_no_helpers() {
        let allocator = Allocator::default();
        let program = Parser::new(&allocator, "import { a } from \"foo\";", SourceType::mjs())
            .parse()
            .program;
        let usage = scan_helper_usage(&program);
        assert!(!usage.needs_import_default);
        assert!(!usage.needs_import_star);
    }

    // ─── emit_cjs: full pipeline ───────────────────────────────────────

    /// Every CJS output starts with `"use strict";` and the `__esModule` flag.
    #[test]
    fn emit_cjs_header() {
        let out = emit_cjs("export const x = 1;", SourceType::ts(), None);
        assert!(out.contains("\"use strict\";"), "got: {out}");
        assert!(out.contains("__esModule"), "got: {out}");
    }

    /// `export const x = …` → `const x = …; exports.x = x;`
    #[test]
    fn emit_cjs_export_const() {
        let out = emit_cjs("export const x = 42;", SourceType::ts(), None);
        assert!(out.contains("const x = 42;"), "got: {out}");
        assert!(out.contains("exports.x = x;"), "got: {out}");
    }

    /// `export function foo() {}` → function decl + `exports.foo = foo;`.
    #[test]
    fn emit_cjs_export_function() {
        let out = emit_cjs(
            "export function foo() { return 1; }",
            SourceType::ts(),
            None,
        );
        assert!(out.contains("function foo"), "got: {out}");
        assert!(out.contains("exports.foo = foo;"), "got: {out}");
    }

    /// `export class C {}` → class decl + `exports.C = C;`.
    #[test]
    fn emit_cjs_export_class() {
        let out = emit_cjs("export class C { m() {} }", SourceType::ts(), None);
        assert!(out.contains("class C"), "got: {out}");
        assert!(out.contains("exports.C = C;"), "got: {out}");
    }

    /// `export { a, b };` → `exports.a = a;` / `exports.b = b;`.
    #[test]
    fn emit_cjs_export_named() {
        let src = "const a = 1;\nconst b = 2;\nexport { a, b };";
        let out = emit_cjs(src, SourceType::ts(), None);
        assert!(out.contains("exports.a = a;"), "got: {out}");
        assert!(out.contains("exports.b = b;"), "got: {out}");
    }

    /// `export default function foo() {}` → `module.exports.default = foo;`.
    #[test]
    fn emit_cjs_export_default_named_function() {
        let out = emit_cjs(
            "export default function foo() { return 1; }",
            SourceType::ts(),
            None,
        );
        assert!(out.contains("function foo"), "got: {out}");
        assert!(out.contains("module.exports.default = foo;"), "got: {out}");
    }

    /// `export default 42;` → `module.exports.default = 42;`.
    #[test]
    fn emit_cjs_export_default_expression() {
        let out = emit_cjs("export default 42;", SourceType::ts(), None);
        assert!(out.contains("module.exports.default = 42;"), "got: {out}");
    }

    /// `export default function() {}` (anonymous) → `module.exports.default = function() …`.
    #[test]
    fn emit_cjs_export_default_anonymous_function() {
        let out = emit_cjs(
            "export default function() { return 1; }",
            SourceType::ts(),
            None,
        );
        assert!(
            out.contains("module.exports.default = function"),
            "got: {out}"
        );
    }

    /// `import x from "foo"` (used in export) → `__importDefault(require("foo"))` + `var x = _….default;`
    #[test]
    fn emit_cjs_default_import() {
        let out = emit_cjs(
            "import x from \"foo\";\nexport { x };",
            SourceType::ts(),
            None,
        );
        assert!(
            out.contains("__importDefault(require(\"foo\"))"),
            "got: {out}"
        );
        assert!(out.contains("var x = "), "got: {out}");
        assert!(out.contains(".default"), "got: {out}");
    }

    /// `import * as ns from "foo"` (used in export) → `var ns = __importStar(require("foo"));`
    #[test]
    fn emit_cjs_namespace_import() {
        let out = emit_cjs(
            "import * as ns from \"foo\";\nexport { ns };",
            SourceType::ts(),
            None,
        );
        assert!(out.contains("__importStar(require(\"foo\"))"), "got: {out}");
        assert!(out.contains("var ns = "), "got: {out}");
    }

    /// `import { a } from "foo"` (used in export) → `var { a } = require("foo");`
    #[test]
    fn emit_cjs_named_import() {
        let out = emit_cjs(
            "import { a } from \"foo\";\nexport { a };",
            SourceType::ts(),
            None,
        );
        assert!(out.contains("var { a } = require(\"foo\");"), "got: {out}");
        // No interop helpers needed for named-only.
        assert!(!out.contains("__importDefault"), "got: {out}");
    }

    /// `import { EventEmitter } from "node:events"` → `var { EventEmitter } = require("node:events");`
    #[test]
    fn emit_cjs_named_import_node_events() {
        let out = emit_cjs(
            "import { EventEmitter } from \"node:events\";\nexport { EventEmitter };",
            SourceType::ts(),
            None,
        );
        assert!(
            out.contains("var { EventEmitter } = require(\"node:events\");"),
            "got: {out}"
        );
    }

    /// `import { a as b } from "foo"` → `var { a: b } = require("foo");`
    #[test]
    fn emit_cjs_named_import_renamed() {
        let out = emit_cjs(
            "import { a as b } from \"foo\";\nexport { b };",
            SourceType::ts(),
            None,
        );
        assert!(
            out.contains("var { a: b } = require(\"foo\");"),
            "got: {out}"
        );
    }

    /// `import "foo"` (side-effect) → `require("foo");`
    #[test]
    fn emit_cjs_bare_import() {
        let out = emit_cjs("import \"foo\";", SourceType::ts(), None);
        assert!(out.contains("require(\"foo\");"), "got: {out}");
        assert!(!out.contains("__importDefault"), "got: {out}");
    }

    /// `export * from "foo"` → `__importStar` + `Object.keys` copy loop.
    #[test]
    fn emit_cjs_export_all() {
        let out = emit_cjs("export * from \"foo\";", SourceType::ts(), None);
        assert!(out.contains("__importStar"), "got: {out}");
        assert!(out.contains("Object.keys"), "got: {out}");
    }

    /// `export * as ns from "foo"` → `exports.ns = __importStar(…);`
    #[test]
    fn emit_cjs_export_all_as_namespace() {
        let out = emit_cjs("export * as ns from \"foo\";", SourceType::ts(), None);
        assert!(out.contains("__importStar"), "got: {out}");
        assert!(out.contains("exports.ns = "), "got: {out}");
    }

    /// `export { a } from "foo"` → `__importDefault` + `exports.a = _….default.a;`
    #[test]
    fn emit_cjs_export_from() {
        let out = emit_cjs("export { a } from \"foo\";", SourceType::ts(), None);
        assert!(out.contains("__importDefault"), "got: {out}");
        assert!(out.contains("exports.a = "), "got: {out}");
    }

    /// TypeScript type annotations are stripped before CJS lowering.
    #[test]
    fn emit_cjs_strips_types() {
        let out = emit_cjs("export const n: number = 5;", SourceType::ts(), None);
        assert!(
            !out.contains(": number"),
            "type should be stripped, got: {out}"
        );
        assert!(out.contains("const n = 5;"), "got: {out}");
        assert!(out.contains("exports.n = n;"), "got: {out}");
    }

    /// TypeScript interfaces are removed.
    #[test]
    fn emit_cjs_strips_interfaces() {
        let src = "interface Foo { bar: string; }\nexport const foo: Foo = { bar: 'x' };";
        let out = emit_cjs(src, SourceType::ts(), None);
        assert!(!out.contains("interface"), "got: {out}");
    }

    /// Mixed default + named import (used in export) should produce both bindings.
    #[test]
    fn emit_cjs_mixed_import() {
        let out = emit_cjs(
            "import def, { named } from \"foo\";\nexport { def, named };",
            SourceType::ts(),
            None,
        );
        assert!(out.contains("__importDefault"), "got: {out}");
        assert!(out.contains("var def = "), "got: {out}");
        assert!(out.contains("var named = "), "got: {out}");
    }

    /// Destructuring export: `export const { a, b } = obj;`
    #[test]
    fn emit_cjs_destructuring_export() {
        let out = emit_cjs(
            "export const { a, b } = { a: 1, b: 2 };",
            SourceType::ts(),
            None,
        );
        assert!(out.contains("exports.a = a;"), "got: {out}");
        assert!(out.contains("exports.b = b;"), "got: {out}");
    }

    /// Non-exported statements should pass through unchanged.
    #[test]
    fn emit_cjs_preserves_non_exported() {
        let out = emit_cjs("const x = 1;\nexport const y = x;", SourceType::ts(), None);
        assert!(out.contains("const x = 1;"), "got: {out}");
        assert!(out.contains("const y = x;"), "got: {out}");
        assert!(out.contains("exports.y = y;"), "got: {out}");
    }

    /// An empty module still has the header.
    #[test]
    fn emit_cjs_empty() {
        let out = emit_cjs("", SourceType::ts(), None);
        assert!(out.contains("\"use strict\";"));
        assert!(out.contains("__esModule"));
    }

    /// Plain JavaScript (non-TS) should work too.
    #[test]
    fn emit_cjs_javascript() {
        let out = emit_cjs("export const x = 1;", SourceType::mjs(), None);
        assert!(out.contains("const x = 1;"), "got: {out}");
        assert!(out.contains("exports.x = x;"), "got: {out}");
    }

    /// Returns a `String`.
    #[test]
    fn emit_cjs_returns_string() {
        let out = emit_cjs("export const x = 1;", SourceType::ts(), None);
        let _: String = out;
    }

    /// Import with aliased named specifier: `import { a as b } from "foo"` (used in export).
    #[test]
    fn emit_cjs_aliased_named_import() {
        let out = emit_cjs(
            "import { a as b } from \"foo\";\nexport { b };",
            SourceType::ts(),
            None,
        );
        assert!(
            out.contains("var { a: b } = require(\"foo\");"),
            "got: {out}"
        );
    }

    /// `"use strict";` must be the very first line, before any helpers.
    #[test]
    fn emit_cjs_use_strict_at_top() {
        let out = emit_cjs(
            "import x from \"foo\";\nexport { x };",
            SourceType::ts(),
            None,
        );
        let first_line = out.lines().next().unwrap_or("");
        assert_eq!(
            first_line, "\"use strict\";",
            "\"use strict\" must be the first line, got: {out}"
        );
        // Helpers come after "use strict".
        let use_strict_pos = out.find("\"use strict\";").unwrap();
        let helper_pos = out.find("__importDefault").unwrap();
        assert!(
            use_strict_pos < helper_pos,
            "use strict must come before helpers, got: {out}"
        );
    }

    /// Top-level `await` wraps the module body in an `async` IIFE.
    #[test]
    fn emit_cjs_top_level_await_wrapped() {
        let out = emit_cjs("await foo();", SourceType::mjs(), None);
        assert!(out.contains("(async () => {"), "got: {out}");
        assert!(out.contains("})();"), "got: {out}");
        // The await should be inside the IIFE, not at the top level.
        let iife_start = out.find("(async () => {").unwrap();
        let await_pos = out.find("await").unwrap();
        assert!(
            await_pos > iife_start,
            "await must be inside IIFE, got: {out}"
        );
    }

    /// `await` inside a function is NOT top-level — no IIFE wrapping needed.
    #[test]
    fn emit_cjs_nested_await_not_wrapped() {
        let src = "async function foo() { await bar(); }\nexport { foo };";
        let out = emit_cjs(src, SourceType::ts(), None);
        assert!(!out.contains("(async () => {"), "got: {out}");
    }

    /// Top-level `await` in an `if` statement is detected.
    #[test]
    fn emit_cjs_tla_in_if_statement() {
        let src = "if (true) { await foo(); }";
        let out = emit_cjs(src, SourceType::mjs(), None);
        assert!(out.contains("(async () => {"), "got: {out}");
    }

    // ─── import.meta lowering ───────────────────────────────────────

    /// `import.meta.url` is lowered to `__import_meta.url` with a CJS shim.
    #[test]
    fn emit_cjs_import_meta_url() {
        let out = emit_cjs("console.log(import.meta.url);", SourceType::mjs(), None);
        assert!(out.contains("__import_meta"), "got: {out}");
        assert!(
            !out.contains("import.meta"),
            "import.meta should be replaced, got: {out}"
        );
        assert!(out.contains("require(\"url\")"), "got: {out}");
    }

    /// `import.meta` in TypeScript is lowered after type stripping.
    #[test]
    fn emit_cjs_import_meta_typescript() {
        let out = emit_cjs(
            "const url: string = import.meta.url;",
            SourceType::ts(),
            None,
        );
        assert!(out.contains("__import_meta"), "got: {out}");
        assert!(!out.contains("import.meta"), "got: {out}");
    }

    /// `import.meta` inside an export declaration is lowered.
    #[test]
    fn emit_cjs_import_meta_in_export() {
        let out = emit_cjs(
            "export const url = import.meta.url;",
            SourceType::mjs(),
            None,
        );
        assert!(out.contains("__import_meta"), "got: {out}");
        assert!(!out.contains("import.meta"), "got: {out}");
        assert!(out.contains("exports.url = url;"), "got: {out}");
    }

    /// Bare `import.meta` (no property access) is lowered to `__import_meta`.
    #[test]
    fn emit_cjs_import_meta_bare() {
        let out = emit_cjs("console.log(import.meta);", SourceType::mjs(), None);
        assert!(out.contains("__import_meta"), "got: {out}");
        assert!(!out.contains("import.meta"), "got: {out}");
    }

    /// Modules without `import.meta` should NOT get the shim.
    #[test]
    fn emit_cjs_no_import_meta_shim() {
        let out = emit_cjs("export const x = 1;", SourceType::mjs(), None);
        assert!(!out.contains("__import_meta"), "got: {out}");
    }

    // ─── expression_has_await ──────────────────────────────────────────

    fn parse_expression_has_await(src: &str) -> bool {
        let allocator = Allocator::default();
        let program = Parser::new(&allocator, src, SourceType::mjs())
            .parse()
            .program;
        program_has_top_level_await(&program)
    }

    #[test]
    fn expression_has_await_detects_real_await() {
        assert!(parse_expression_has_await("await foo();"));
        assert!(parse_expression_has_await("const x = await foo();"));
    }

    #[test]
    fn expression_has_await_string_literal_no_false_positive() {
        // A string literal containing "await " should NOT be detected.
        assert!(!parse_expression_has_await("const s = 'await foo';"));
        assert!(!parse_expression_has_await(
            "const s = \"await something\";"
        ));
    }

    #[test]
    fn expression_has_await_template_literal_no_false_positive() {
        // A template literal containing "await" in its text portion.
        assert!(!parse_expression_has_await("const s = `await foo`;"));
    }

    #[test]
    fn expression_has_await_template_literal_with_expression_detects() {
        // A template literal with an await expression inside ${}.
        assert!(parse_expression_has_await("const s = `${await foo()}`;"));
    }

    #[test]
    fn expression_has_await_nested_in_binary() {
        assert!(parse_expression_has_await("const x = 1 + await foo();"));
    }

    #[test]
    fn expression_has_await_nested_in_conditional() {
        assert!(parse_expression_has_await(
            "const x = cond ? await foo() : bar();"
        ));
    }

    #[test]
    fn expression_has_await_no_false_positive_on_property_name() {
        // `obj.await` — `await` is a property name, not an await expression.
        assert!(!parse_expression_has_await("obj.await;"));
    }
}
