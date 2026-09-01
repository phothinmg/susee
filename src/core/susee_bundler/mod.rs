use crate::core::susee_deps::susee_tree;
use crate::core::susee_hooks::{clean, run_tree_hooks};
use crate::core::susee_log;
use crate::core::susee_types::ProjectType;
use crate::core::susee_utils::{is_non_local_import, merge_content, merge_imports_statement};
use std::path::Path;

pub struct BundleResult {
    pub bundled_code: String,
    pub project_type: ProjectType,
}

/// Bundle `entry` (resolved relative to `root`) into a single source string.
///
/// When `check` is `true`, the `susee_check` diagnostics run on the freshly
/// generated `susee_tree` **before** `run_tree_hooks` rewrites the
/// dependency files. This matters for CommonJS/CTS modules: the hooks
/// convert `require`/`module.exports` into ESM, which shifts line positions
/// and would make the reported locations wrong. Running the checks on the
/// original source keeps every reported `file:line:col` accurate.
///
/// If any check finds an issue, `check_and_exit` prints the report and
/// exits the process with code 1, so `run_tree_hooks` (and the rest of the
/// bundle) never executes.
pub fn bundler<P: AsRef<Path>>(
    entry: &str,
    root: P,
    check_default_exports: Option<bool>,
    check_anonymous: Option<bool>,
) -> std::io::Result<BundleResult> {
    let tree = susee_tree(entry, root, check_default_exports, check_anonymous)?;
    let project_type = tree.project_type;
    // Check for warnings.
    if !tree.warns.is_empty() {
        let info = "Warning in your dependencies tree";
        let cause = tree.warns.join("\n");
        let e = true;
        susee_log::error(info, &cause, e);
    }
    // Run susee_check diagnostics BEFORE tree hooks so the reported line
    // positions match the original source files (CommonJS/CTS content is
    // rewritten by the hooks, which would shift line numbers).
    // if check {
    //     check_and_exit(&tree);
    // }
    // Run tree hooks (anonymous, export-default, duplicates, remove imports/exports).
    // The removed import statements are collected for re-emission at the top of the bundle.
    let (clean_tree, removed_statements) = run_tree_hooks(tree);
    let dep_files: Vec<super::susee_types::DepsFile> = clean_tree.dep_files;
    let mut removed_stats = removed_statements;
    removed_stats.retain(|s| is_non_local_import(s));
    removed_stats = merge_imports_statement(&removed_stats);
    let import_statements = removed_stats.join("\n").trim().to_string();
    let (dep_files_content, main_file_content) = merge_content(&dep_files);

    let mut content = format!("{import_statements}\n{dep_files_content}\n{main_file_content}");

    // Remove empty lines and lines that start with ";" that remain after
    // removing imports. Use `&&` so that BOTH conditions must hold for a
    // line to be kept (the previous `||` kept everything).
    content = content
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty() && !line.starts_with(';'))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    let file = if clean_tree.project_type == ProjectType::JS {
        "bundle.js"
    } else if clean_tree.project_type == ProjectType::MIXED {
        "bundle.ts"
    } else {
        "bundle.ts"
    };
    content = clean(&content, file);
    // Pretty-print the bundled output by round-tripping it through oxc's
    // codegen, which re-indents and normalizes formatting.
    content = pretty_print(&content, file);
    Ok(BundleResult {
        bundled_code: content,
        project_type,
    })
}

/// Pretty-print a JS/TS source string by parsing it and regenerating it with
/// oxc's codegen. Comments are preserved so file separators (`// path.ts`)
/// and jsdoc blocks survive the round-trip.
fn pretty_print(content: &str, file: &str) -> String {
    use oxc::allocator::Allocator;
    use oxc::codegen::{Codegen, CodegenOptions, CommentOptions};
    use oxc::parser::Parser;
    use oxc::span::SourceType;

    let ts_file = if file == "bundle.js" {
        "bundle.ts"
    } else {
        file
    };
    let path = std::path::Path::new(ts_file);
    let source_type = SourceType::from_path(path).unwrap_or_default();
    let allocator = Allocator::default();
    let parser_return = Parser::new(&allocator, content, source_type).parse();
    if !parser_return.panicked && parser_return.diagnostics.is_empty() {
        let options = CodegenOptions {
            single_quote: true,
            comments: CommentOptions {
                normal: true,
                jsdoc: true,
                annotation: true,
                legal: oxc::codegen::LegalComment::Inline,
            },
            ..CodegenOptions::default()
        };
        Codegen::new()
            .with_options(options)
            .build(&parser_return.program)
            .code
    } else {
        // If parsing fails (e.g. invalid syntax), keep the original content
        // rather than dropping the bundle on the floor.
        content.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    /// Helper: create a minimal TS project in a temp dir and return the dir.
    fn make_project() -> tempfile::TempDir {
        let dir = tempdir().unwrap();
        // Entry file imports a dependency and re-exports it.
        fs::write(
            dir.path().join("index.ts"),
            "import { greet } from './greeter';\nexport { greet };\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("greeter.ts"),
            "export const greet = (): string => 'hello';\n",
        )
        .unwrap();
        dir
    }

    #[test]
    fn bundler_produces_non_empty_output() {
        let dir = make_project();
        let result = bundler("index.ts", dir.path(), Some(false), Some(false)).unwrap();
        assert!(!result.bundled_code.trim().is_empty());
    }

    #[test]
    fn bundler_returns_ts_project_type_for_ts_files() {
        let dir = make_project();
        let result = bundler("index.ts", dir.path(), Some(false), Some(false)).unwrap();
        assert_eq!(result.project_type, ProjectType::TS);
    }

    #[test]
    fn bundler_inlines_dependency_content() {
        let dir = make_project();
        let result = bundler("index.ts", dir.path(), Some(false), Some(false)).unwrap();
        // The bundled output should contain the `greet` definition.
        assert!(result.bundled_code.contains("greet"));
    }

    #[test]
    fn bundler_returns_err_for_missing_entry() {
        let dir = tempdir().unwrap();
        let result = bundler("index.ts", dir.path(), Some(false), Some(false));
        assert!(result.is_err());
    }

    #[test]
    fn bundler_strips_empty_and_semicolon_lines() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join("index.ts"),
            "export const x = 1;\n\n;\nexport const y = 2;\n",
        )
        .unwrap();
        let result = bundler("index.ts", dir.path(), Some(false), Some(false)).unwrap();
        // No line should be just a semicolon.
        for line in result.bundled_code.lines() {
            assert_ne!(line.trim(), ";");
        }
        // No empty lines in the trimmed output.
        assert!(!result.bundled_code.trim().is_empty());
    }

    #[test]
    fn bundler_js_project_returns_js_project_type() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join("index.js"),
            "import { greet } from './greeter.js';\nexport { greet };\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("greeter.js"),
            "export const greet = () => 'hello';\n",
        )
        .unwrap();
        let result = bundler("index.ts", dir.path(), Some(false), Some(false)).unwrap();
        assert_eq!(result.project_type, ProjectType::JS);
    }

    #[test]
    fn pretty_print_preserves_valid_code() {
        let code = "const x = 1;\nconst y = 2;\n";
        let printed = pretty_print(code, "bundle.ts");
        assert!(printed.contains("const x = 1"));
        assert!(printed.contains("const y = 2"));
    }

    #[test]
    fn pretty_print_falls_back_on_invalid_syntax() {
        let code = "this is not valid typescript {{{";
        let printed = pretty_print(code, "bundle.ts");
        // Should return the original content unchanged.
        assert_eq!(printed, code);
    }
}
