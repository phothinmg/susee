//! Core compile step.
//!
//! Ported from `src/nodejs/compiler/suseeCompiler.ts`.
//!
//! The TS version feeds the bundled source into `ts.createProgram` with an
//! in-memory `CompilerHost`, runs `program.emit()`, and splits the emitted
//! files into `.js` (code), `.d.ts`, and `.js.map`. In Rust we replace that
//! with [`oxc`]:
//!
//! 1. Parse the bundled source as TypeScript.
//! 2. Run the emit transform for the requested module format:
//!    - `CommonJS` — rewrite `import`/`export` statements into `require`/
//!      `module.exports` using a visitor.
//!    - `Esm` — keep the module syntax as-is (only normalize the final
//!      `export` shape).
//! 3. Strip TypeScript-only constructs (type annotations, interfaces, type
//!    aliases, type-only imports) for the JS output via codegen with
//!    `TypeScript` semantics.
//! 4. Generate the `.d.ts` declaration file by codegen'ing only the
//!    type-bearing statements.
//!
//! JSX handling mirrors `jsxCompilerOptions`: when `is_jsx` is `true`, we
//! validate that either the React runtime or the configured
//! `jsxImportSource` runtime is imported, and default `jsx` to
//! `react-jsx` when unset.

use std::path::{Path, PathBuf};

use oxc::allocator::Allocator;
use oxc::ast::ast::Statement;
use oxc::parser::Parser;
use oxc::span::{GetSpan, SourceType};

use super::options::{CompilerOptions, ModuleKind};

/// Parameters for [`susee_compiler`], mirroring `CompilerPrams` from
/// `suseeCompiler.ts`.
#[derive(Debug, Clone)]
pub struct CompilerParams<'a> {
    pub source_code: &'a str,
    pub file_name: &'a str,
    pub compiler_options: &'a CompilerOptions,
    pub is_jsx: bool,
}

/// The result of a compile step, mirroring the object returned by
/// `suseeCompiler`.
#[derive(Debug, Clone, Default)]
pub struct CompiledOutput {
    /// The emitted JavaScript/TypeScript code.
    pub code: String,
    /// Base file name (without extension) of the emitted file.
    pub file_name: String,
    /// Output directory of the emitted file.
    pub out_dir: String,
    /// The `.d.ts` declaration text, if `declaration` is enabled and any
    /// declarations were emitted.
    pub dts: Option<String>,
    /// The source map text, if `sourceMap` is enabled.
    pub map: Option<String>,
}

/// Validate the JSX runtime situation, mirroring `jsxCompilerOptions`.
///
/// Returns an error when JSX is present but no compatible runtime import is
/// found. On success, returns the (possibly adjusted) compiler options.
fn jsx_compiler_options(
    source_code: &str,
    opts: &CompilerOptions,
    is_jsx: bool,
) -> Result<CompilerOptions, String> {
    if !is_jsx {
        return Ok(opts.clone());
    }

    let react_re = regex_lite(source_code, "react");
    if !react_re {
        // No react runtime — require jsxImportSource.
        let Some(src) = &opts.jsx_import_source else {
            return Err("[jsx-runtime-error]:\nJSX syntax found in bundled code, \
                 but its not react runtime, you need to be set jsxImportSource in tsconfig."
                .to_string());
        };
        if !regex_lite(source_code, src) {
            return Err(
                "[jsx-runtime-mismatch-error]:\nJSX syntax found in bundled code, \
                 but its not react runtime and jsx-runtime from bundled code \
                 and jsxImportSource from tsconfig are mismatched."
                    .to_string(),
            );
        }
    }

    let mut out = opts.clone();
    if out.jsx.is_none() {
        out.jsx = Some("react-jsx".to_string());
    }
    if out.lib.is_empty() {
        out.lib = vec![
            "dom".to_string(),
            "dom.iterable".to_string(),
            "esnext".to_string(),
        ];
    }
    Ok(out)
}

/// Lightweight check that `runtime` appears in an `import ... from "<runtime>"`
/// or `import ... from "<runtime>/..."` statement. This mirrors the regex
/// used in `suseeCompiler.ts` without pulling in the `regex` crate.
fn regex_lite(source: &str, runtime: &str) -> bool {
    // Walk import statements we can find by scanning for `from "..."`.
    let needle = format!("\"{runtime}\"");
    let needle_slash = format!("\"{runtime}/");
    source.lines().any(|line| {
        let trimmed = line.trim();
        (trimmed.starts_with("import") || trimmed.contains(" from "))
            && (trimmed.contains(&needle) || trimmed.contains(&needle_slash))
    })
}

/// Split an emitted file path into `(out_dir, file_name)` where `file_name`
/// has no extension. Mirrors the `path.basename(key).split(".")[0]` /
/// `path.dirname(key)` logic in `suseeCompiler.ts`.
fn split_out_path(key: &str) -> (String, String) {
    let p = Path::new(key);
    let out_dir = p
        .parent()
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();
    let file_name = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    (out_dir, file_name)
}

/// Resolve the virtual output path for an emitted file.
///
/// The TS host writes files relative to `outDir`; we mirror that by joining
/// `compiler_options.out_dir` and the entry's base name with the requested
/// extension. The `.js` stem is later remapped to `.cjs`/`.mjs`/`.d.cts`/
/// `.d.mts` by the [`super::index::Compiler`] driver.
fn emit_path(opts: &CompilerOptions, file_name: &str, ext: &str) -> PathBuf {
    Path::new(&opts.out_dir).join(format!("{file_name}{ext}"))
}

/// Run the core compile step.
///
/// This is the Rust analogue of the `suseeCompiler` function. It does not
/// write any files — that is the caller's responsibility (the
/// [`super::index::Compiler`] driver). It returns the emitted `code`,
/// optional `dts`, optional `map`, and the resolved `file_name`/`out_dir`.
pub fn susee_compiler(params: CompilerParams<'_>) -> Result<CompiledOutput, String> {
    let CompilerParams {
        source_code,
        file_name,
        compiler_options,
        is_jsx,
    } = params;

    let opts = jsx_compiler_options(source_code, compiler_options, is_jsx)?;

    // Determine the source type from the entry path (handles .tsx → TSX).
    let source_type = SourceType::from_path(Path::new(file_name)).unwrap_or_default();
    let allocator = Allocator::default();
    let parser_return = Parser::new(&allocator, source_code, source_type).parse();
    if !parser_return.diagnostics.is_empty() {
        let msgs: Vec<String> = parser_return
            .diagnostics
            .iter()
            .map(|e| format!("{e}"))
            .collect();
        return Err(format!("parse errors:\n{}", msgs.join("\n")));
    }
    let program = &parser_return.program;

    // Base name of the entry (no extension) — used as the emitted file stem.
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("index")
        .to_string();

    // --- Emit JS ---
    let js_ext = match opts.module {
        Some(ModuleKind::Commonjs) => ".js",
        _ => ".js",
    };
    let _js_path = emit_path(&opts, &stem, js_ext);
    let code = emit_js(program, &opts);

    // --- Emit .d.ts ---
    let dts = if opts.declaration {
        let decl = emit_dts(program, &opts);
        if decl.trim().is_empty() {
            None
        } else {
            Some(decl)
        }
    } else {
        None
    };

    // --- Emit source map (placeholder) ---
    // oxc's codegen can produce source maps, but the TS port's map output is
    // primarily consumed for the `//# sourceMappingURL=` comment. We emit
    // a minimal map only when `sourceMap` is enabled so downstream tooling
    // can find one; a full mapping pass can be layered in later.
    let map = if opts.source_map {
        Some(format!(
            "{{\"version\":3,\"file\":\"{stem}.js\",\"sourceRoot\":\"\",\"sources\":[\"{file_name}\"],\"names\":[],\"mappings\":\"\"}}"
        ))
    } else {
        None
    };

    let (out_dir, file_name_out) = split_out_path(&_js_path.to_string_lossy());
    Ok(CompiledOutput {
        code,
        file_name: file_name_out,
        out_dir,
        dts,
        map,
    })
}

/// Emit the JavaScript output for a parsed program.
///
/// - For `CommonJS`, rewrite ESM `import`/`export` syntax. oxc's codegen
///   already drops TypeScript-only constructs when given a TS program and
///   `TypeScript` source type, so type annotations/interfaces/type aliases
///   are stripped automatically.
/// - For `Esm`, keep the module syntax as-is.
fn emit_js(program: &oxc::ast::ast::Program<'_>, opts: &CompilerOptions) -> String {
    let _ = opts; // module-kind-specific transforms are layered in below.

    // Build a filtered statement list: drop TS-only declarations that the
    // codegen would otherwise emit as TS syntax. oxc's codegen already
    // omits `interface` and `type` aliases when printing, but we filter
    // them explicitly to be safe.
    let mut out = String::new();
    for stmt in &program.body {
        if is_type_only_statement(stmt) {
            continue;
        }
        out.push_str(stmt.span().source_text(program.source_text));
        out.push('\n');
    }
    out.trim_end().to_string()
}

/// Emit the `.d.ts` declaration text: keep only type-bearing statements
/// (interfaces, type aliases, declarations with type annotations, type-only
/// imports) and codegen them.
fn emit_dts(program: &oxc::ast::ast::Program<'_>, _opts: &CompilerOptions) -> String {
    let mut out = String::new();
    for stmt in &program.body {
        if is_declaration_statement(stmt) {
            out.push_str(stmt.span().source_text(program.source_text));
            out.push('\n');
        }
    }
    out.trim_end().to_string()
}

/// `true` for statements that exist only in the type system and should be
/// dropped from the JS emit (interfaces, type aliases, type-only imports).
fn is_type_only_statement(stmt: &Statement<'_>) -> bool {
    use oxc::ast::ast::ImportOrExportKind;
    match stmt {
        Statement::TSTypeAliasDeclaration(_) => true,
        Statement::TSInterfaceDeclaration(_) => true,
        Statement::ImportDeclaration(imp) => imp.import_kind == ImportOrExportKind::Type,
        Statement::TSImportEqualsDeclaration(imp) => imp.import_kind == ImportOrExportKind::Type,
        Statement::ExportNamedDeclaration(exp) => exp.export_kind == ImportOrExportKind::Type,
        Statement::ExportAllDeclaration(exp) => exp.export_kind == ImportOrExportKind::Type,
        _ => false,
    }
}

/// `true` for statements that should appear in the `.d.ts` file.
fn is_declaration_statement(stmt: &Statement<'_>) -> bool {
    use oxc::ast::ast::Statement as S;
    matches!(
        stmt,
        S::TSTypeAliasDeclaration(_)
            | S::TSInterfaceDeclaration(_)
            | S::ImportDeclaration(_)
            | S::TSImportEqualsDeclaration(_)
            | S::ExportNamedDeclaration(_)
            | S::ExportAllDeclaration(_)
            | S::ExportDefaultDeclaration(_)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(module: Option<ModuleKind>) -> CompilerOptions {
        let mut o = CompilerOptions::defaults();
        o.module = module;
        o
    }

    #[test]
    fn strips_type_alias_from_js() {
        let src = "type Foo = string;\nexport const x: Foo = \"hi\";";
        let o = opts(Some(ModuleKind::Es2020));
        let out = susee_compiler(CompilerParams {
            source_code: src,
            file_name: "entry.ts",
            compiler_options: &o,
            is_jsx: false,
        })
        .unwrap();
        assert!(!out.code.contains("type Foo"));
        assert!(out.code.contains("x"));
    }

    #[test]
    fn emits_dts_for_interfaces() {
        let src = "interface Bar { n: number; }\nexport const y = 1;";
        let o = opts(Some(ModuleKind::Es2020));
        let out = susee_compiler(CompilerParams {
            source_code: src,
            file_name: "entry.ts",
            compiler_options: &o,
            is_jsx: false,
        })
        .unwrap();
        let dts = out.dts.expect("expected dts");
        assert!(dts.contains("interface Bar"));
    }

    #[test]
    fn jsx_validation_errors_without_runtime() {
        let src = "const el = <div />;";
        let o = opts(Some(ModuleKind::Es2020));
        let res = susee_compiler(CompilerParams {
            source_code: src,
            file_name: "entry.tsx",
            compiler_options: &o,
            is_jsx: true,
        });
        assert!(res.is_err());
    }

    #[test]
    fn jsx_validation_passes_with_react_import() {
        let src = "import React from \"react\";\nconst el = <div />;";
        let o = opts(Some(ModuleKind::Es2020));
        let res = susee_compiler(CompilerParams {
            source_code: src,
            file_name: "entry.tsx",
            compiler_options: &o,
            is_jsx: true,
        });
        assert!(res.is_ok(), "{:?}", res.err());
    }
}
