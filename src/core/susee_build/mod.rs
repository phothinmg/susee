//! Build orchestration — the top-level entry point for `susee build`.
//!
//! [`susee_build`] takes a normalized [`SuSeeConfig`], generates
//! [`BuildOptions`], creates a [`Compiler`], and runs [`Compiler::compile`].
//!
//! [`build`] is the convenience wrapper used by the CLI and napi binding:
//! when a config is provided it is used directly; otherwise the config is
//! loaded from `susee.config.jsonc` (or `susee.config.json`) in the current
//! directory. If no config file is found, an error is printed and the
//! process exits with code 1.

use crate::core::susee_compiler::Compiler;
use crate::core::susee_config::{
    SuSeeConfig, generate_build_options, get_susee_config_path, read_config_file,
};

pub fn susee_build(config: &SuSeeConfig) -> Result<(), String> {
    let build_options = generate_build_options(config)?;

    // `susee_check` diagnostics are run inside `bundler` (gated by
    // `build_options.check`) so the reported line positions reflect the
    // original source files BEFORE the tree hooks rewrite CommonJS/CTS
    // modules into ESM. See `susee_bundler::bundler`.
    let mut compiler = Compiler::new(build_options);
    compiler
        .compile()
        .map_err(|e| format!("build failed: {e}"))?;
    Ok(())
}

pub fn build(config: Option<&SuSeeConfig>) {
    if let Some(config) = config {
        if let Err(e) = susee_build(config) {
            eprintln!("[Error] : {e}");
            std::process::exit(1);
        }
    } else {
        let Some(config_path) = get_susee_config_path() else {
            eprintln!("[Error] : no config file found and no config provided");
            std::process::exit(1);
        };
        let config_options = read_config_file(&config_path).unwrap_or_else(|e| {
            eprintln!("[Error] : failed to read config: {e}");
            std::process::exit(1);
        });
        if let Err(e) = susee_build(&config_options) {
            eprintln!("[Error] : {e}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::susee_config::{EntryPoint, SuSeeConfig};
    use crate::core::susee_types::OutputFormat;

    fn make_def(entry: &str) -> SuSeeConfig {
        SuSeeConfig {
            entry_points: vec![EntryPoint {
                entry: entry.to_string(),
                export_path: ".".to_string(),
                format: Some(vec![OutputFormat::Esm]),
                tsconfig_file_path: None,
                minify: Some(false),
                check_anonymous: Some(false),
                check_default_exports: Some(false),
            }],
            out_dir: Some("dist".to_string()),
            allow_update_package_json: Some(false),
        }
    }

    #[test]
    fn susee_build_returns_err_for_missing_entry_file() {
        // `check_entries` validates that the entry file exists on disk.
        // A nonexistent path should produce an error.
        let config = make_def("/nonexistent/path/that/does/not/exist/index.ts");
        let result = susee_build(&config);
        assert!(result.is_err());
    }

    #[test]
    fn susee_build_returns_err_for_empty_entries() {
        let config = SuSeeConfig {
            entry_points: vec![],
            out_dir: Some("dist".to_string()),
            allow_update_package_json: Some(false),
        };
        let result = susee_build(&config);
        assert!(result.is_err());
        // The error message should mention "no entry".
        let msg = result.unwrap_err();
        assert!(msg.to_lowercase().contains("no entry"));
    }
}
