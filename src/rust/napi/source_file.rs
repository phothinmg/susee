//! `SourceFile` napi class.
//!
//! Ported conceptually from `ts.SourceFile` + `ts.createSourceFile`. Holds
//! the parsed oxc AST serialized to JSON, plus the original source text so
//! [`print`] can re-emit it.
//!
//! In the TS API, `ts.SourceFile` is a mutable node tree you traverse with
//! `forEachChild` and re-print with `ts.createPrinter`. Here the AST is
//! immutable JSON; JS plugins read it to make decisions, then transform the
//! source string at the plugin hook stage (see [`crate::plugins`]).

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// A parsed TypeScript/JavaScript source file.
///
/// Created by [`super::parse_source_file`]. Exposes the AST as JSON (via
/// [`Self::to_json`] / [`Self::program`]) and can re-print the source (via
/// [`Self::print`]).
///
/// Equivalent to `ts.SourceFile` from `@suseejs/ts6`.
#[napi]
pub struct SourceFile {
    /// The original source text (UTF-8).
    pub(crate) source_text: String,
    /// The file name / path used to determine the source type (e.g. `.tsx`
    /// → TSX). Stored so JS can inspect it.
    pub(crate) file_name: String,
    /// The AST serialized to a JSON string. Kept as a string so the napi
    /// boundary is simple and JS gets a plain object via `JSON.parse` in
    /// [`Self::to_json`], or directly via [`Self::program`].
    pub(crate) ast_json: String,
}

#[napi]
impl SourceFile {
    /// Re-print the source as formatted code.
    ///
    /// Mirrors `ts.createPrinter().printFile(sourceFile)`. Because the AST
    /// is immutable JSON, this re-parses the original source text with oxc
    /// and runs the codegen — producing consistently formatted output.
    /// For the common "I just want the original source" case, prefer
    /// [`Self::text`].
    #[napi]
    pub fn print(&self) -> Result<String> {
        use oxc::allocator::Allocator;
        use oxc::codegen::{Codegen, CodegenOptions, IndentChar};
        use oxc::parser::Parser;
        use oxc::span::SourceType;

        let path = std::path::Path::new(&self.file_name);
        let source_type = SourceType::from_path(path).unwrap_or_default();
        let allocator = Allocator::default();
        let parser_return = Parser::new(&allocator, &self.source_text, source_type).parse();
        if !parser_return.diagnostics.is_empty() {
            let msgs: Vec<String> = parser_return
                .diagnostics
                .iter()
                .map(|d| format!("{d}"))
                .collect();
            return Err(Error::new(
                Status::GenericFailure,
                format!("reparse errors:\n{}", msgs.join("\n")),
            ));
        }
        let code = Codegen::new()
            .with_options(CodegenOptions {
                indent_char: IndentChar::Space,
                indent_width: 4,
                ..CodegenOptions::default()
            })
            .build(&parser_return.program)
            .code;
        Ok(code)
    }

    /// Return the original source text unchanged.
    ///
    /// Cheaper than [`Self::print`] when no AST transformation happened.
    #[napi]
    pub fn text(&self) -> String {
        self.source_text.clone()
    }

    /// The file name passed to [`super::parse_source_file`].
    #[napi]
    pub fn file_name(&self) -> String {
        self.file_name.clone()
    }

    /// Return the AST as a JSON string.
    ///
    /// Use this when you want to forward the AST to another tool. For
    /// in-process JS walking, prefer [`Self::program`] which returns the
    /// object directly.
    #[napi]
    pub fn to_json(&self) -> String {
        self.ast_json.clone()
    }

    /// Return the AST as a JS object.
    ///
    /// napi-rs converts `serde_json::Value` to a JS object automatically,
    /// so JS plugins can walk it with plain property access:
    /// ```js
    /// const sf = suseeNative.parseSourceFile(code, "entry.ts");
    /// for (const stmt of sf.program.body) { ... }
    /// ```
    #[napi(getter)]
    pub fn program(&self) -> serde_json::Value {
        serde_json::from_str(&self.ast_json).unwrap_or(serde_json::Value::Null)
    }
}
