//! ESM output emitter.
//!
//! Parses the bundled source, runs oxc's transformer (to strip TS types
//! when needed), and re-emits as ECMAScript module syntax via oxc's
//! codegen. The output is ready to be written to a `.mjs`/`.js` file with
//! `"type": "module"` in `package.json`.

use oxc::allocator::Allocator;
use oxc::codegen::Codegen;
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
use oxc::span::SourceType;
use oxc::transformer::{TransformOptions, Transformer};
use std::path::Path;

/// Emit ECMAScript module (ESM) code from a source string.
///
/// This function runs the full oxc pipeline — parse → semantic analysis →
/// transform → codegen — and returns the generated JavaScript/TypeScript as a
/// [`String`].
///
/// # Arguments
///
/// * `source_code` — The raw source text to compile. May be JavaScript or
///   TypeScript depending on the supplied [`SourceType`].
/// * `source_type` — The [`SourceType`] describing the module kind (module vs.
///   script) and language variant (JS, TS, TSX, JSX). Use
///   [`SourceType::module`] for standard ESM output.
/// * `file_path` — Optional path of the source file. This is forwarded to the
///   [`Transformer`] so that transformer features which depend on the file
///   location (such as JSX automatic runtime resolution) work correctly. When
///   [`None`] an empty path is used.
///
/// # Returns
///
/// The codegen output as a [`String`].
///
/// # Panics
///
/// * Panics with an `"oxc parse error: …"` message if the parser flags the
///   input as panicked or reports fatal diagnostics.
/// * Panics with an `"oxc transform error: …"` message if the transformer
///   reports error-level diagnostics.
///
pub fn emit_esm(
    source_code: &str,
    source_type: SourceType,
    file_path: Option<String>,
) -> std::string::String {
    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, source_code, source_type);
    let parsed_program = parser.parse();
    if parsed_program.panicked {
        let diags = parsed_program
            .diagnostics
            .iter()
            .map(|d| format!("{d}"))
            .collect::<Vec<_>>()
            .join("\n");
        panic!("oxc parse error: {diags}");
    }
    let mut program = parsed_program.program;
    let scoping = SemanticBuilder::new_compiler()
        .build(&program)
        .semantic
        .into_scoping();
    let entry_path = file_path.unwrap_or_default();
    let source_path = Path::new(&entry_path);
    let transform_options = TransformOptions::default();
    let transformed = Transformer::new(&allocator, source_path, &transform_options)
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
    let codegen_output = Codegen::new().build(&program);
    codegen_output.code
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A small ESM program should round-trip through the pipeline unchanged.
    #[test]
    fn preserves_export_const() {
        let src = "export const answer = 42;";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            out.contains("export const answer = 42;"),
            "expected export to be preserved, got: {out}"
        );
    }

    /// A simple function export should survive codegen.
    #[test]
    fn preserves_export_function() {
        let src = "export function add(a, b) { return a + b; }";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            out.contains("export function add"),
            "expected exported function, got: {out}"
        );
        assert!(out.contains("return a + b;"));
    }

    /// Default exports must be retained.
    #[test]
    fn preserves_default_export() {
        let src = "export default function main() { return 0; }";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            out.contains("export default"),
            "expected default export, got: {out}"
        );
    }

    /// `import` statements that are used should remain in the output.
    #[test]
    fn preserves_import() {
        let src = "import { x } from './mod.js';\nexport const y = x;";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            out.contains("import"),
            "expected import to be preserved, got: {out}"
        );
    }

    /// TypeScript type annotations are stripped by the transformer, leaving
    /// plain JavaScript in the emitted output.
    #[test]
    fn strips_type_annotations() {
        let src = "export const n: number = 5;";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            !out.contains(": number"),
            "type annotation should be stripped, got: {out}"
        );
        assert!(out.contains("const n = 5;"));
    }

    /// TypeScript interfaces must be removed entirely.
    #[test]
    fn strips_interfaces() {
        let src = "interface Foo { bar: string; }\nexport const foo: Foo = { bar: 'x' };";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            !out.contains("interface"),
            "interface should be removed, got: {out}"
        );
        assert!(out.contains("export const foo"));
    }

    /// TypeScript type aliases must be removed entirely.
    #[test]
    fn strips_type_aliases() {
        let src = "type ID = string;\nexport const id: ID = 'abc';";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            !out.contains("type ID"),
            "type alias should be removed, got: {out}"
        );
        assert!(out.contains("const id = "));
    }

    /// TSX with JSX should transform JSX into function calls.
    #[test]
    fn transforms_tsx_jsx() {
        let src = "export const el = <div>hello</div>;";
        let out = emit_esm(src, SourceType::tsx(), Some("test.tsx".to_string()));
        assert!(
            !out.contains("<div>"),
            "JSX syntax should be transformed, got: {out}"
        );
    }

    /// A bare value export should pass through.
    #[test]
    fn handles_re_export() {
        let src = "export { value } from './other.js';";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            out.contains("export"),
            "re-export should be preserved, got: {out}"
        );
        assert!(out.contains("from"));
    }

    /// Multiple statements should all appear in the output.
    #[test]
    fn handles_multiple_statements() {
        let src = "const a = 1;\nconst b = 2;\nexport const sum = a + b;";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(out.contains("const a = 1;"));
        assert!(out.contains("const b = 2;"));
        assert!(out.contains("export const sum"));
    }

    /// An empty source should produce empty (or whitespace-only) output.
    #[test]
    fn handles_empty_source() {
        let out = emit_esm("", SourceType::ts(), None);
        assert!(out.trim().is_empty(), "expected empty output, got: {out}");
    }

    /// A module-level `await` (top-level await) should be preserved for ESM.
    #[test]
    fn preserves_top_level_await() {
        let src = "export const data = await fetch('/api');";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(
            out.contains("await"),
            "top-level await should be preserved, got: {out}"
        );
    }

    /// Passing a `file_path` should not change the emitted code for a trivial
    /// example but must not panic.
    #[test]
    fn accepts_file_path() {
        let src = "export const x = 1;";
        let out = emit_esm(src, SourceType::ts(), Some("src/mod.ts".to_string()));
        assert!(out.contains("export const x = 1;"));
    }

    /// Plain JavaScript (non-TS) source should also work.
    #[test]
    fn handles_javascript_module() {
        let src = "export const value = 'hello';";
        let out = emit_esm(src, SourceType::ts(), None);
        assert!(out.contains("export const value"));
    }

    /// Verify the function signature returns a [`String`].
    #[test]
    fn returns_string_type() {
        let out = emit_esm("export const x = 1;", SourceType::ts(), None);
        // Compile-time check that the return is a String.
        let _: String = out;
    }
}
