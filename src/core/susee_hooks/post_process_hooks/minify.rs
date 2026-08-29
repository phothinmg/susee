//! Post-process minification hook.
//!
//! Runs on the **final emitted JavaScript** string (after the compiler's
//! codegen step, before files are written to disk) and applies oxc's
//! minifier pipeline:
//!
//! 1. Re-parse the JS source into an oxc [`Program`].
//! 2. Run [`oxc::minifier::Minifier`] with [`MinifierOptions`] (compression
//!    + mangling) to shrink the AST.
//! 3. Re-emit with [`Codegen`] configured for minified whitespace output.
//!
//! This mirrors the `--minify` behaviour of the TypeScript port: a single
//! post-process pass over the bundled + compiled output. It is gated by
//! [`BuildOptions::minify`](crate::core::susee_config::BuildOptions::minify)
//! in the compiler driver.
//!
//! # Parser source type
//!
//! The emitted code is already plain JavaScript (TypeScript types have been
//! stripped by the transformer earlier in the pipeline), so we parse with a
//! JS [`SourceType`]. The module kind (`mjs` vs `cjs`) is inferred from the
//! [`OutputFormat`] so that `import`/`export` (ESM) or `require`/`module`
//! (CJS) syntax parses cleanly.

use oxc::allocator::Allocator;
use oxc::codegen::{Codegen, CodegenOptions};
use oxc::minifier::{Minifier, MinifierOptions};
use oxc::parser::Parser;
use oxc::span::SourceType;

use crate::core::susee_config::OutputFormat;

/// Minify a compiled JS source string.
///
/// Returns the minified source. When minification is disabled or parsing
/// fails, the original source is returned unchanged so the build never
/// breaks on a minifier edge case.
///
/// # Arguments
///
/// * `code` — The post-codegen JavaScript source to minify.
/// * `format` — The [`OutputFormat`] the code was emitted for, used to pick
///   the right [`SourceType`] (`.mjs` module vs `.cjs` script).
/// * `file_name` — The entry file path, forwarded to the parser for
///   `SourceType::from_path` derivation (falls back to a sensible default).
#[must_use]
pub fn minify_js(code: &str, format: OutputFormat, file_name: &str) -> String {
    if code.trim().is_empty() {
        return code.to_string();
    }

    // Derive a JS (not TS) source type. The compiler already stripped types,
    // so we force `with_typescript(false)` and let the module flag follow the
    // output format: ESM stays a module, CJS is parsed as a script.
    let source_type = SourceType::from_path(std::path::Path::new(file_name))
        .unwrap_or_else(|_| match format {
            OutputFormat::Esm => SourceType::mjs(),
            OutputFormat::Commonjs => SourceType::cjs(),
        })
        .with_typescript(false)
        .with_module(matches!(format, OutputFormat::Esm));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, code, source_type).parse();

    // Never let a minifier parse failure abort the build — fall back to the
    // original emitted code.
    if parsed.panicked {
        return code.to_string();
    }

    let mut program = parsed.program;

    let minifier = Minifier::new(MinifierOptions::default());
    let _ = minifier.minify(&allocator, &mut program);

    Codegen::new()
        .with_options(CodegenOptions::minify())
        .build(&program)
        .code
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shrinks_whitespace_and_drops_dead_code() {
        let src = r#"
function add(a, b) {
  const unused = 999;
  return a + b;
}
export default add;
"#;
        let out = minify_js(src, OutputFormat::Esm, "index.mjs");
        assert!(out.len() < src.len(), "minified output should be smaller");
        // Whitespace and comments are gone.
        assert!(!out.contains("\n  "));
        // Dead local should be eliminated by the compressor's `unused` pass.
        assert!(!out.contains("unused"));
        // The export survives.
        assert!(out.contains("export default"));
    }

    #[test]
    fn handles_cjs_output() {
        let src = "const x = 1 + 2; module.exports = x;\n";
        let out = minify_js(src, OutputFormat::Commonjs, "index.cjs");
        assert!(out.contains("module.exports"));
        assert!(out.len() <= src.len());
    }

    #[test]
    fn empty_input_passes_through() {
        let out = minify_js("   ", OutputFormat::Esm, "index.mjs");
        assert_eq!(out, "   ");
    }

    #[test]
    fn parse_failure_falls_back_to_original() {
        // Deliberately invalid JS — parser should panic, hook returns input.
        let src = "export default function(";
        let out = minify_js(src, OutputFormat::Esm, "index.mjs");
        assert_eq!(out, src);
    }
}
