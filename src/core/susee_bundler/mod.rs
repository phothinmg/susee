use crate::core::susee_hooks::{clean, run_tree_hooks};
use crate::core::susee_log;
use crate::core::susee_tree::susee_tree;
use crate::core::susee_types::ProjectType;
use crate::core::susee_utils::{is_non_local_import, merge_content, merge_imports_statement};
use std::path::Path;
use std::time::Instant;

pub struct BundleResult {
    pub bundled_code: String,
    pub project_type: ProjectType,
}

//
pub fn bundler<P: AsRef<Path>>(entry: &str, root: P) -> std::io::Result<BundleResult> {
    let bundler_start = Instant::now();
    let tree = susee_tree(entry, root)?;
    let project_type = tree.project_type;
    // Check for warnings.
    if !tree.warns.is_empty() {
        let info = "Warning in your dependencies tree";
        let cause = tree.warns.join("\n");
        let e = true;
        susee_log::error(info, &cause, e);
    }
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
    susee_log::bundle_time(bundler_start);
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
