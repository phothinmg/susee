use crate::core::susee_compiler::Compiler;
use crate::core::susee_config::{
    SuSeeConfig, generate_build_options, get_susee_config_path, read_config_file,
};
use std::fs;

pub fn susee_build(config: &SuSeeConfig) -> Result<(), String> {
    let build_options = generate_build_options(config)?;

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
        let config_path = get_susee_config_path().expect("");
        if fs::exists(&config_path).is_ok() {
            let config_options = read_config_file(&config_path).expect("");
            if let Err(e) = susee_build(&config_options) {
                eprintln!("[Error] : {e}");
                std::process::exit(1);
            }
        } else {
            eprintln!("[Error] : no config file found and no config provided");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::susee_config::{EntryPoint, OutputFormat, SuSeeConfig};

    fn make_def(entry: &str) -> SuSeeConfig {
        SuSeeConfig {
            entry_points: vec![EntryPoint {
                entry: entry.to_string(),
                export_path: ".".to_string(),
                format: Some(vec![OutputFormat::Esm]),
                tsconfig_file_path: None,
                warning: Some(false),
            }],
            out_dir: Some("dist".to_string()),
            allow_update_package_json: Some(false),
            minify: Some(false),
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
            minify: Some(false),
        };
        let result = susee_build(&config);
        assert!(result.is_err());
        // The error message should mention "no entry".
        let msg = result.unwrap_err();
        assert!(msg.to_lowercase().contains("no entry"));
    }
}
