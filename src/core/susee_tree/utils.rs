use std::path::Path;

use oxc::allocator::Allocator;
use oxc::ast::ast::Expression;
use oxc::ast_visit::Visit;
use oxc::parser::Parser;
use oxc::span::SourceType;

use super::types::ModuleType;

/// Replace the `.json` extension with `.ts` in a file path.
///
/// Mirrors `jsonExtToTs` from `helpers.ts`.
pub fn json_ext_to_ts(file: &str) -> String {
    if Path::new(file).extension().is_some_and(|ext| ext == "json") {
        file.replace(".json", ".ts")
    } else {
        file.to_string()
    }
}

/// Parse `content` as TypeScript/JavaScript and call `f` with the resulting `Program`.
///
/// The file path is used only to determine the source type (e.g. `.tsx` → TSX).
/// For `.json` files the extension is replaced with `.ts` before parsing,
/// mirroring `jsonExtToTs`.
///
/// This uses a callback pattern to avoid self-referential struct issues —
/// the `Program` borrows from the `Allocator`, so both must stay in the same scope.
pub fn with_parsed_program<R, F>(file: &str, content: &str, f: F) -> R
where
    F: for<'a> FnOnce(&oxc::ast::ast::Program<'a>) -> R,
{
    let ts_file = json_ext_to_ts(file);
    let path = Path::new(&ts_file);
    let source_type = SourceType::from_path(path).unwrap_or_default();
    let allocator = Allocator::default();
    let parser_return = Parser::new(&allocator, content, source_type).parse();
    f(&parser_return.program)
}

/// Detect whether a source file uses CommonJS or ESM syntax
///
/// Returns the [`ModuleType`]:
/// - `Json` for `.json` files.
/// - `Cjs` when CommonJS syntax (`require`, `module.exports`, `exports.x`) is
///   present without ESM syntax.
/// - `Esm` otherwise (ESM syntax present, or no module syntax).
pub fn detect_module_type(content: &str, file_path: &Path) -> ModuleType {
    let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");

    if ext == "json" {
        return ModuleType::Json;
    }

    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    // If parsing fails, fall back to ESM.
    let parser_return = Parser::new(&allocator, content, source_type).parse();
    let program = &parser_return.program;

    let mut detector = ModuleTypeDetector::default();
    detector.visit_program(program);

    // `.cts` files use CommonJS-like semantics via TS `import =` / `export =`
    // syntax. Detect them before the generic CJS/ESM fallback.
    if ext == "cts" && detector.is_cts {
        return ModuleType::Cts;
    }

    if detector.is_common_js && !detector.is_esm {
        ModuleType::Cjs
    } else if detector.is_esm && detector.is_common_js {
        // Mixed — treat as ESM (matches the TS version's `_esmCount++` branch).
        ModuleType::Esm
    } else {
        // ESM or no module syntax detected → default to ESM.
        ModuleType::Esm
    }
}

#[derive(Default)]
pub struct ModuleTypeDetector {
    is_esm: bool,
    is_common_js: bool,
    is_cts: bool,
}

impl<'a> Visit<'a> for ModuleTypeDetector {
    // ESM: import declarations.
    fn visit_import_declaration(&mut self, _it: &oxc::ast::ast::ImportDeclaration<'a>) {
        self.is_esm = true;
        // Don't walk children — we only care about the declaration itself.
    }

    // ESM: export named declarations.
    fn visit_export_named_declaration(&mut self, _it: &oxc::ast::ast::ExportNamedDeclaration<'a>) {
        self.is_esm = true;
    }

    // ESM: export default declarations.
    fn visit_export_default_declaration(
        &mut self,
        _it: &oxc::ast::ast::ExportDefaultDeclaration<'a>,
    ) {
        self.is_esm = true;
    }

    // ESM: export all declarations (`export * from "..."`).
    fn visit_export_all_declaration(&mut self, _it: &oxc::ast::ast::ExportAllDeclaration<'a>) {
        self.is_esm = true;
    }

    // TS import-equals (`import foo = require("...")`) counts as ESM.
    fn visit_ts_import_equals_declaration(
        &mut self,
        _it: &oxc::ast::ast::TSImportEqualsDeclaration<'a>,
    ) {
        self.is_esm = true;
        // `import foo = require("...")` is the CommonJS-style import syntax
        // used by `.cts` files.
        self.is_cts = true;
    }

    // TS export-assignment (`export = foo`) — the CommonJS-style export syntax
    // used by `.cts` files.
    fn visit_ts_export_assignment(&mut self, _it: &oxc::ast::ast::TSExportAssignment<'a>) {
        self.is_cts = true;
    }

    // CommonJS: `require(...)` calls.
    fn visit_call_expression(&mut self, it: &oxc::ast::ast::CallExpression<'a>) {
        if let Expression::Identifier(ident) = &it.callee {
            if ident.name.as_str() == "require" {
                self.is_common_js = true;
                // Don't walk children — we already captured it.
                return;
            }
        }
        // Otherwise walk normally to find nested require/import expressions.
        self.visit_expression(&it.callee);
        self.visit_arguments(&it.arguments);
    }

    // CommonJS: `module.exports` / `exports.x` static member access.
    fn visit_static_member_expression(&mut self, it: &oxc::ast::ast::StaticMemberExpression<'a>) {
        if let Expression::Identifier(ident) = &it.object {
            let name = ident.name.as_str();
            let prop = it.property.name.as_str();
            if (name == "module" && prop == "exports") || name == "exports" {
                self.is_common_js = true;
            }
        }
        // Walk children to find more.
        self.visit_expression(&it.object);
    }
}

/// Detect whether a source file contains JSX syntax, mirroring
/// `utils.checks.isJsxContent` from `node_src/helpers/utilities.ts`.
pub fn is_jsx_content(content: &str, file_path: &Path) -> bool {
    let allocator = Allocator::default();
    // Parse as TSX to detect JSX regardless of the file's real extension.
    let source_type = SourceType::from_path(file_path)
        .unwrap_or_default()
        .with_jsx(true);
    let parser_return = Parser::new(&allocator, content, source_type).parse();
    let program = &parser_return.program;

    let mut detector = JsxDetector::default();
    detector.visit_program(program);
    detector.contains_jsx
}

#[derive(Default)]
pub struct JsxDetector {
    contains_jsx: bool,
}

impl<'a> Visit<'a> for JsxDetector {
    fn visit_jsx_element(&mut self, _it: &oxc::ast::ast::JSXElement<'a>) {
        self.contains_jsx = true;
    }

    fn visit_jsx_fragment(&mut self, _it: &oxc::ast::ast::JSXFragment<'a>) {
        self.contains_jsx = true;
    }
}

/// Read a file relative to `root`, returning its content and byte length.
pub fn read_file(root: &Path, rel_path: &str) -> std::io::Result<(String, usize)> {
    let abs = root.join(rel_path);
    let content = std::fs::read_to_string(&abs)?;
    let bytes = content.len();
    Ok((content, bytes))
}
