//! Source map generation utilities.
//!
//! Provides [`sm_commonjs`] and [`sm_esm`] for generating browser-ready
//! source map JSON strings from parsed JavaScript/TypeScript source.
//!
//! Both functions parse the input with oxc, then re-emit via [`Codegen`]
//! with `source_map_path` enabled. The resulting JSON string is returned
//! directly, ready to be written to a `.map` file.
//!
//! # Fallback
//!
//! [`SourceType::from_path`] uses [`unwrap_or_default()`] so unusual file
//! extensions do not panic — the default source type (ESM script) is used
//! instead.

use oxc::allocator::Allocator;
use oxc::codegen::{Codegen, CodegenOptions};
use oxc::parser::Parser;
use oxc::span::SourceType;
use std::path::Path;

pub fn sm_commonjs(source_text: &str, file_name: &str) -> Option<String> {
    let allocator = Allocator::default();
    let source_path = Path::new(file_name);
    let source_type = SourceType::from_path(source_path)
        .unwrap_or_default()
        .with_module(false);
    let parser = Parser::new(&allocator, source_text, source_type);
    let parsed = parser.parse();

    if !parsed.diagnostics.is_empty() {
        for error in parsed.diagnostics {
            eprintln!("Parse error: {:?}", error);
        }
    }
    let codegen_options = CodegenOptions {
        source_map_path: Some(source_path.into()),
        ..CodegenOptions::default()
    };
    let codegen_return = Codegen::new()
        .with_options(codegen_options)
        .build(&parsed.program);
    if let Some(source_map) = codegen_return.map {
        // You can serialize it straight to a browser-ready JSON string
        Some(source_map.to_json_string())
    } else {
        println!("Source map generation was not active.");
        None
    }
}

pub fn sm_esm(source_text: &str, file_name: &str) -> Option<String> {
    let allocator = Allocator::default();
    let source_path = Path::new(file_name);
    let source_type = SourceType::from_path(source_path)
        .unwrap_or_default()
        .with_module(true);
    let parser = Parser::new(&allocator, source_text, source_type);
    let parsed = parser.parse();

    if !parsed.diagnostics.is_empty() {
        for error in parsed.diagnostics {
            eprintln!("Parse error: {:?}", error);
        }
    }
    let codegen_options = CodegenOptions {
        source_map_path: Some(source_path.into()),
        ..CodegenOptions::default()
    };
    let codegen_return = Codegen::new()
        .with_options(codegen_options)
        .build(&parsed.program);
    if let Some(source_map) = codegen_return.map {
        // You can serialize it straight to a browser-ready JSON string
        Some(source_map.to_json_string())
    } else {
        println!("Source map generation was not active.");
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sm_esm_generates_source_map_for_valid_code() {
        let code = "const x = 1;\nexport { x };\n";
        let result = sm_esm(code, "test.mjs");
        assert!(result.is_some(), "should produce a source map");
        let map = result.unwrap();
        assert!(map.contains("test.mjs") || map.contains("test"));
    }

    #[test]
    fn sm_commonjs_generates_source_map_for_valid_code() {
        let code = "const x = 1;\nmodule.exports = { x };\n";
        let result = sm_commonjs(code, "test.cjs");
        assert!(result.is_some(), "should produce a source map");
    }

    #[test]
    fn sm_esm_does_not_panic_on_empty_input() {
        let result = sm_esm("", "empty.mjs");
        let _ = result;
    }

    #[test]
    fn sm_commonjs_does_not_panic_on_unusual_extension() {
        // Bug fix: `SourceType::from_path().unwrap()` panicked on unusual
        // extensions. Now uses `unwrap_or_default()`.
        let result = sm_commonjs("const x = 1;", "file.unknownext");
        let _ = result;
    }

    #[test]
    fn sm_esm_does_not_panic_on_unusual_extension() {
        // Bug fix: `SourceType::from_path().unwrap()` panicked on unusual
        // extensions. Now uses `unwrap_or_default()`.
        let result = sm_esm("const x = 1;", "file.unknownext");
        let _ = result;
    }
}
