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
use oxc::parser::Parser;
use oxc::span::SourceType;

use super::source_map::{sm_commonjs, sm_esm};
use crate::core::susee_config::{CompilerOptions, ModuleKind};
use crate::core::susee_types::ProjectType;

/// Parameters for [`susee_compiler`], mirroring `CompilerPrams` from
/// `suseeCompiler.ts`.
#[derive(Debug, Clone)]
pub struct CompilerParams<'a> {
    pub source_code: &'a str,
    pub file_name: &'a str,
    pub temp_dir: &'a str,
    pub export_path: String,
    pub compiler_options: &'a CompilerOptions,
    pub is_jsx: bool,
    #[allow(dead_code)]
    pub project_type: ProjectType,
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
    use super::dts::emit_dts;
    let CompilerParams {
        source_code,
        file_name,
        #[allow(unused)]
        temp_dir,
        #[allow(unused)]
        export_path,
        compiler_options,
        is_jsx,
        project_type: _,
    } = params;

    let opts = jsx_compiler_options(source_code, compiler_options, is_jsx)?;

    // Determine the source type from the entry path (handles .tsx → TSX).
    // Force module mode so ESM `import`/`export` statements parse even when
    // the file extension alone wouldn't imply a module.
    let source_type = SourceType::from_path(Path::new(file_name))
        .unwrap_or_default()
        .with_module(true);

    // Base name of the entry (no extension) — used as the emitted file stem.
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("index")
        .to_string();

    // --- Emit JS ---
    //
    // JS emit is handled entirely with **oxc** APIs via the sibling modules
    // [`super::cjs`] and [`super::esm`]:
    //
    // * `Commonjs` — [`super::cjs::emit_cjs`] strips TypeScript types with
    //   oxc's transformer and then lowers `import`/`export` to
    //   `require`/`module.exports` with inlined interop helpers, matching
    //   the upstream `ts6` CommonJS output.
    // * `Es2020` — [`super::esm::emit_esm`] runs oxc's transformer (type
    //   stripping only) and preserves ESM `import`/`export` syntax verbatim.
    //
    // When `sourceMap` is enabled, a real VLQ-encoded v3 source map is built
    // with oxc's `Codegen` (`CodegenOptions::source_map_path`) — see
    // [`emit_js`].
    let js_ext = ".js";
    let _js_path = emit_path(&opts, &stem, js_ext);
    let (mut code, map_json) = emit_js(source_code, file_name, &opts, opts.source_map);

    // Mirror `tsc`'s emit: append a `//# sourceMappingURL=<stem>.js.map`
    // comment so downstream tooling (and the driver's `.js.map` →
    // `.cjs.map`/`.mjs.map` rewrite) can locate the sidecar map.
    if opts.source_map {
        if !code.ends_with('\n') {
            code.push('\n');
        }
        code.push_str(&format!("//# sourceMappingURL={stem}.js.map\n"));
    }

    // --- Emit .d.ts ---
    //
    // We re-parse a fresh copy of the source (the JS transform above mutated
    // `program` in place) and feed it to oxc's `IsolatedDeclarations`, which
    // mirrors TypeScript's `--isolatedDeclarations` emit: it produces a
    // declaration-only AST that the codegen turns into clean `.d.ts` text.
    let dts = if opts.declaration {
        let decl = emit_dts(source_code, source_type);
        if decl.trim().is_empty() {
            None
        } else {
            Some(decl)
        }
    } else {
        None
    };

    // Suppress unused-binding warnings for fields only read via `format!`.
    let _ = &opts.target;
    let _ = &opts.lib;

    // --- Source map ---
    // `emit_js` already built a real, VLQ-encoded v3 map with oxc's
    // `Codegen` when `sourceMap` was enabled. The
    // `//# sourceMappingURL=` comment was appended to `code` above.
    let map = map_json;

    let (out_dir, file_name_out) = split_out_path(&_js_path.to_string_lossy());
    Ok(CompiledOutput {
        code,
        file_name: file_name_out,
        out_dir,
        dts,
        map,
    })
}

/// Emit the JavaScript output for `source_code`.
///
/// This uses **oxc** APIs only, delegating the module-format-specific work to
/// the sibling modules [`super::cjs`] and [`super::esm`]:
///
/// 1. **Code** — [`super::cjs::emit_cjs`] for `Commonjs` (TypeScript type
///    stripping via oxc's transformer, then ESM→CJS lowering with inlined
///    interop helpers), or [`super::esm::emit_esm`] for `Es2020` (type
///    stripping only, ESM syntax preserved).
/// 2. **Source map** — when `build_source_map` is `true`, the original source
///    is parsed with oxc and printed with [`oxc::codegen::Codegen`] configured
///    with [`oxc::codegen::CodegenOptions::source_map_path`]. oxc's
///    [`SourcemapBuilder`] turns the captured `(Span, generated line/col)`
///    tuples into a real VLQ-encoded v3 source map, returned as the second
///    tuple element (the same v3 shape the previous swc path produced).
///
/// The `.d.ts` emit also uses oxc (see [`emit_dts`]).
fn emit_js(
    source_code: &str,
    file_name: &str,
    opts: &CompilerOptions,
    build_source_map: bool,
) -> (String, Option<String>) {
    use oxc::span::SourceType;

    // 1. Emit the JS code via the format-specific oxc pipeline.
    let source_type = SourceType::from_path(std::path::Path::new(file_name))
        .unwrap_or_default()
        .with_module(true);

    let code = match opts.module {
        Some(ModuleKind::Commonjs) => {
            super::cjs::emit_cjs(source_code, source_type, Some(file_name.to_string()))
        }
        _ => super::esm::emit_esm(source_code, source_type, Some(file_name.to_string())),
    };

    // 2. Build the source map
    let map_json = if build_source_map {
        if opts.module == Some(ModuleKind::Commonjs) {
            sm_commonjs(&code, file_name)
        } else {
            sm_esm(&code, file_name)
        }
    } else {
        None
    };

    (code, map_json)
}

/// Emit the `.d.ts` declaration text for `source_code`.
///
/// Re-parses the source (the JS-emitting transform mutated the earlier
/// program in place) and runs oxc's [`IsolatedDeclarations`] transform,
/// which produces a declaration-only AST. That AST is codegen'd into the
/// final `.d.ts` text — interfaces, type aliases, and `export declare`
/// signatures only, with all runtime bodies dropped.
///
/// ## Return-type inference
/// oxc's `IsolatedDeclarations` follows TypeScript's strict
/// `--isolatedDeclarations` mode: it only emits a return type for functions
/// that already carry an explicit annotation (or whose body is a single
/// `return <literal>` it can infer from). Real-world async functions such
/// as `async function build() { ... }` have neither, so oxc leaves them
/// without a return type and emits a `TS9007` diagnostic — producing an
/// invalid `declare function build();` line.
///
/// The upstream `ts6` compiler infers return types for `.d.ts` emit, so to
/// match its output we run a pre-pass over the parsed program: any
/// top-level (or exported) function declaration whose `return_type` is
/// `None` gets a synthetic annotation — `Promise<void>` for `async`
/// functions (the type TS infers for `async fn()` with no/void return) and
/// `void` for plain functions. `IsolatedDeclarations` then sees explicit
/// annotations and emits clean `declare function f(): Promise<void>;`
/// lines without diagnostics.
#[allow(unused)]
fn emit_dts(source_code: &str, source_type: SourceType) -> String {
    use oxc::codegen::Codegen;
    use oxc::isolated_declarations::{IsolatedDeclarations, IsolatedDeclarationsOptions};

    let allocator = Allocator::default();
    let mut parser_return = Parser::new(&allocator, source_code, source_type).parse();
    if !parser_return.diagnostics.is_empty() {
        let msgs: Vec<String> = parser_return
            .diagnostics
            .iter()
            .map(|e| format!("{e}"))
            .collect();
        eprintln!(
            "[warn] parse errors during .d.ts emit:\n{}",
            msgs.join("\n")
        );
    }

    // Pre-pass: fill in missing return types so IsolatedDeclarations doesn't
    // emit `declare function f();` (no return type) for async/void fns.
    annotate_missing_return_types(&allocator, &mut parser_return.program);

    let ret = IsolatedDeclarations::new(
        &allocator,
        IsolatedDeclarationsOptions {
            strip_internal: false,
        },
    )
    .build(&parser_return.program);
    if ret.diagnostics.has_errors() {
        let msgs: Vec<String> = ret.diagnostics.iter().map(|e| format!("{e}")).collect();
        eprintln!("[warn] isolated-declaration errors:\n{}", msgs.join("\n"));
    }
    Codegen::new().build(&ret.program).code
}

/// Walk `program.body` and attach a synthetic return-type annotation to any
/// function declaration (direct, `export`-wrapped, or `export default`-wrapped)
/// that lacks one. `async` functions get `Promise<void>`; plain functions get
/// `void`. This mirrors what the TypeScript compiler infers for `.d.ts` emit.
fn annotate_missing_return_types<'a>(
    allocator: &'a Allocator,
    program: &mut oxc::ast::ast::Program<'a>,
) {
    use oxc::allocator::ArenaVec;
    use oxc::ast::ast::{
        Declaration, ExportDefaultDeclarationKind, Function, Statement, TSType, TSTypeAnnotation,
        TSTypeName, TSTypeParameterInstantiation,
    };
    use oxc::ast::builder::AstBuilder;
    use oxc::span::SPAN;

    let ast = AstBuilder::new(allocator);

    for stmt in program.body.iter_mut() {
        match stmt {
            // `async function foo() {}`
            Statement::FunctionDeclaration(func) => {
                ensure_return_type(&ast, func);
            }
            // `export function foo() {}` / `export default function foo() {}`
            Statement::ExportDeclaration(exp) => {
                if let Declaration::FunctionDeclaration(func) = &mut exp.declaration {
                    ensure_return_type(&ast, func);
                }
            }
            Statement::ExportDefaultDeclaration(exp) => {
                if let ExportDefaultDeclarationKind::FunctionDeclaration(func) =
                    &mut exp.declaration
                {
                    ensure_return_type(&ast, func);
                }
            }
            _ => {}
        }
    }

    /// Build a `Promise<void>` (async) or `void` (sync) return-type annotation
    /// and assign it to `func.return_type` when it is currently `None`.
    fn ensure_return_type<'a>(ast: &AstBuilder<'a>, func: &mut Function<'a>) {
        if func.return_type.is_some() {
            return;
        }
        func.return_type = Some(make_return_type_annotation(ast, func.r#async));
    }

    /// Construct the `TSTypeAnnotation` box for the synthetic return type.
    fn make_return_type_annotation<'a>(
        ast: &AstBuilder<'a>,
        is_async: bool,
    ) -> oxc::allocator::Box<'a, TSTypeAnnotation<'a>> {
        let type_annotation = if is_async {
            // `Promise<void>`
            // 1. `void` keyword type
            let void_type = TSType::new_ts_void_keyword(SPAN, ast);
            // 2. type-args vector `[void]`
            let mut params: ArenaVec<'a, TSType<'a>> = ArenaVec::with_capacity_in(1, ast);
            params.push(void_type);
            // 3. `TSTypeParameterInstantiation` wrapping the args
            let type_args = TSTypeParameterInstantiation::boxed(SPAN, params, ast);
            // 4. `Promise` identifier reference as the type name
            let promise_name = TSTypeName::new_identifier_reference(SPAN, "Promise", ast);
            // 5. `Promise<void>` type reference
            TSType::new_ts_type_reference(SPAN, promise_name, Some(type_args), ast)
        } else {
            // `void`
            TSType::new_ts_void_keyword(SPAN, ast)
        };
        TSTypeAnnotation::boxed(SPAN, type_annotation, ast)
    }
}
