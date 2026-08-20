//! Bundler helper utilities.
//!
//! Ported from `src/nodejs/bundler/lib/helpers.ts`.
//!
//! Provides:
//! - [`with_parsed_program`] — parse source text and call a closure with the AST.
//! - [`is_json`] — check if the dependency tree contains JSON modules.
//! - [`json_ext_to_ts`] — replace `.json` extension with `.ts`.
//! - [`get_file_key`] — normalize a file path into a key for name lookups.
//! - [`get_module_key_from_specifier`] — resolve a module specifier to a file key.

use std::path::{Path, PathBuf};

use oxc::allocator::Allocator;
use oxc::parser::Parser;
use oxc::span::SourceType;

use crate::dependensa::{DependenciesTree, ModuleType, ValidExts};

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

/// Generate source code from an oxc `Program`.
///
/// Pretty-prints with 4-space indentation to match the TypeScript bundler's
/// printer output.
pub fn codegen_program(program: &oxc::ast::ast::Program<'_>) -> String {
    use oxc::codegen::{Codegen, CodegenOptions, IndentChar};
    Codegen::new()
        .with_options(CodegenOptions {
            indent_char: IndentChar::Space,
            indent_width: 4,
            ..CodegenOptions::default()
        })
        .build(program)
        .code
}

/// Check whether the dependency tree contains any JSON module files.
///
/// Mirrors `isJSON` from `helpers.ts`.
pub fn is_json(tree: &DependenciesTree) -> bool {
    tree.dep_files
        .iter()
        .any(|f| f.file_ext == ValidExts::Json && f.module_type == ModuleType::Json)
}

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

/// Normalize a file path into a key suitable for name-lookup maps.
///
/// Strips the extension and, if the file is named `index`, uses the parent
/// directory instead.  Mirrors `getFileKey` / `normalizePathKey`.
pub fn get_file_key(file_path: &str) -> String {
    let p = Path::new(file_path);
    let dir = p.parent().unwrap_or_else(|| Path::new(""));
    let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");

    let no_ext = if name == "index" {
        dir.to_path_buf()
    } else {
        dir.join(name)
    };

    normalize_path(&no_ext)
}

/// Resolve a module specifier to a file key, mirroring
/// `getModuleKeyFromSpecifier`.
///
/// For relative specifiers (`./` or `../`) the path is resolved relative to
/// `containing_file` and normalized. For absolute specifiers starting with
/// `/` the path is normalized. Otherwise the specifier is returned as-is.
pub fn get_module_key_from_specifier(spec: &str, containing_file: &str) -> String {
    if spec.starts_with('.') || spec.starts_with('/') {
        let base_dir = Path::new(containing_file)
            .parent()
            .unwrap_or_else(|| Path::new(""));
        let joined = base_dir.join(spec);
        // Normalize: remove `.` and `..` components
        let resolved = normalize_path(&joined);
        // Strip extension and handle index
        get_file_key(&resolved)
    } else {
        spec.to_string()
    }
}

/// Normalize a relative path by collapsing `.` and `..` components.
fn normalize_path(p: &Path) -> String {
    let mut result = PathBuf::new();
    for component in p.components() {
        use std::path::Component::*;
        match component {
            CurDir => {}
            ParentDir => {
                result.pop();
            }
            Normal(c) => {
                result.push(c);
            }
            RootDir => {}
            Prefix(_) => {}
        }
    }
    result.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_ext_to_ts() {
        assert_eq!(json_ext_to_ts("foo/bar.json"), "foo/bar.ts");
        assert_eq!(json_ext_to_ts("foo/bar.ts"), "foo/bar.ts");
    }

    #[test]
    fn test_get_file_key() {
        assert_eq!(get_file_key("src/foo/bar.ts"), "src/foo/bar");
        assert_eq!(get_file_key("src/foo/index.ts"), "src/foo");
        assert_eq!(get_file_key("./bar.ts"), "bar");
    }
}
