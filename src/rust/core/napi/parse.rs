//! `parseSourceFile` binding.
//!
//! Ported from `ts.createSourceFile(fileName, sourceText, languageVersion)`.
//!
//! Parses TypeScript/JavaScript source with oxc, serializes the resulting
//! `Program` to JSON, and returns a [`super::SourceFile`] holding both the
//! original text and the AST JSON.

use std::path::Path;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use oxc::allocator::Allocator;
use oxc::parser::Parser;
use oxc::span::SourceType;

use super::SourceFile;

/// Parse TypeScript/JavaScript source into a [`SourceFile`].
///
/// Mirrors `ts.createSourceFile(fileName, sourceText, ScriptTarget.Latest,
/// /*setParentNodes*/ true)`.
///
/// The `file_name` is used only to pick the source type (`.tsx` → TSX,
/// `.json` → JSON, etc.) — it does not need to exist on disk.
///
/// # Errors
/// Returns a napi `GenericFailure` if oxc reports parse diagnostics.
#[napi]
pub fn parse_source_file(source_text: String, file_name: String) -> Result<SourceFile> {
    parse_source_file_inner(&source_text, &file_name)
}

/// Reusable inner implementation, callable from other napi modules (e.g.
/// `DepsFileEntry::parse`) without going through the napi boundary.
///
/// Takes borrowed strings so callers that already hold a `&str` (e.g. a
/// `MutexGuard`'s `content`/`file`) don't need to clone.
pub fn parse_source_file_inner(source_text: &str, file_name: &str) -> Result<SourceFile> {
    let source_type = SourceType::from_path(Path::new(file_name)).unwrap_or_default();
    let allocator = Allocator::default();
    let parser_return = Parser::new(&allocator, source_text, source_type).parse();

    if !parser_return.diagnostics.is_empty() {
        let msgs: Vec<String> = parser_return
            .diagnostics
            .iter()
            .map(|d| format!("{d}"))
            .collect();
        return Err(Error::new(
            Status::GenericFailure,
            format!("parse errors:\n{}", msgs.join("\n")),
        ));
    }

    let program = &parser_return.program;
    // oxc serializes the AST to ESTree JSON via its own `to_estree_json`
    // method (not serde derive), producing a JSON string with a `type`
    // field on each node — the shape JS plugins and our predicates expect.
    let ast_json = program.to_estree_json(true, false);

    Ok(SourceFile {
        source_text: source_text.to_string(),
        file_name: file_name.to_string(),
        ast_json,
    })
}
