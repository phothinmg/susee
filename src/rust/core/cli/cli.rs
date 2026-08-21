//! Single-entry CLI compiler.
//!
//! Ported from `src/nodejs/cli/cli.ts` (`CliCompiler`).
//!
//! The TS version is a separate class from the config-based `Compiler`
//! because it reads options from CLI flags rather than from a config file.
//! In Rust we avoid duplicating the compile logic by constructing a
//! single-entry [`BuildOptions`] from the parsed [`CliBuildOptions`] and
//! delegating to [`crate::compiler::Compiler`]. This keeps the emit logic
//! in one place, matching the "single source of truth" goal of the Rust
//! port.
//!
//! The plugin/hook dispatch that appears in `cli.ts` is stubbed here too —
//! see the project notes; the plugin system is layered in separately.

use std::time::Instant;

use crate::core::compiler::Compiler;
use crate::core::config::{BuildEntryPoint, BuildOptions, OutputFormat};

use super::lib::fail::fail;
use super::lib::parse_argv::CliBuildOptions;

/// Build a single-entry [`BuildOptions`] from CLI flags, mirroring the
/// mapping the `CliCompiler._commonjs`/`_esm` methods do implicitly.
fn build_options_from_cli(opts: &CliBuildOptions) -> BuildOptions {
    let entry = BuildEntryPoint {
        entry: opts.entry.clone(),
        export_path: ".".to_string(),
        format: vec![opts.format],
        tsconfig_file_path: opts.tsconfig.clone(),
        output_directory_path: opts.out_dir.clone(),
        warning: opts.warning,
        plugins: Vec::new(),
    };
    BuildOptions {
        build_entry_points: vec![entry],
        update_package: opts.allow_update,
        out_dir: opts.out_dir.clone(),
    }
}

/// Compile a single entry point from CLI flags.
///
/// Mirrors `CliCompiler.compile(opts)` from `cli.ts`.
pub fn cli_compiler_compile(opts: &CliBuildOptions) {
    let start = Instant::now();
    let build_options = build_options_from_cli(opts);
    let mut compiler = Compiler::new(build_options);
    if let Err(e) = compiler.compile() {
        fail(&format!("build failed: {e}"));
    }
    let elapsed = start.elapsed().as_secs_f64();
    let label = match opts.format {
        OutputFormat::Commonjs => "commonjs",
        OutputFormat::Esm => "esm",
    };
    eprintln!("[Build:{label}] {elapsed:.2}s");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cli_opts(format: OutputFormat) -> CliBuildOptions {
        CliBuildOptions {
            entry: "src/index.ts".to_string(),
            out_dir: "dist".to_string(),
            format,
            tsconfig: None,
            allow_update: false,
            warning: false,
            profile: false,
        }
    }

    #[test]
    fn build_options_from_cli_single_entry() {
        let opts = cli_opts(OutputFormat::Esm);
        let bo = build_options_from_cli(&opts);
        assert_eq!(bo.build_entry_points.len(), 1);
        let ep = &bo.build_entry_points[0];
        assert_eq!(ep.entry, "src/index.ts");
        assert_eq!(ep.export_path, ".");
        assert_eq!(ep.format, vec![OutputFormat::Esm]);
        assert_eq!(ep.output_directory_path, "dist");
        assert!(!bo.update_package);
    }

    #[test]
    fn build_options_preserves_cjs_format() {
        let opts = cli_opts(OutputFormat::Commonjs);
        let bo = build_options_from_cli(&opts);
        assert_eq!(
            bo.build_entry_points[0].format,
            vec![OutputFormat::Commonjs]
        );
    }

    #[test]
    fn build_options_propagates_allow_update() {
        let mut opts = cli_opts(OutputFormat::Esm);
        opts.allow_update = true;
        let bo = build_options_from_cli(&opts);
        assert!(bo.update_package);
    }

    #[test]
    fn build_options_propagates_tsconfig() {
        let mut opts = cli_opts(OutputFormat::Esm);
        opts.tsconfig = Some("tsconfig.build.json".to_string());
        let bo = build_options_from_cli(&opts);
        assert_eq!(
            bo.build_entry_points[0].tsconfig_file_path.as_deref(),
            Some("tsconfig.build.json")
        );
    }
}
