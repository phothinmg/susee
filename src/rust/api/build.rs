//! Programmatic build entry point.
//!
//! Ported from the `build(options?)` function in `src/nodejs/index.ts`.
//!
//! This is the library surface — it returns `Result` and never exits the
//! process. The CLI wrapper lives at [`crate::cli::build::cli_build`].
//!
//! Two entry points:
//! - [`build`] — build from an in-memory [`SuSeeConfig`].
//! - [`build_from_config_file`] — build from a `susee.config.json` on disk.

use std::path::Path;
use std::time::Instant;

use crate::cli::config::{
    SuSeeConfig, generate_build_options, get_susee_config_path, read_config_file,
};
use crate::compiler::Compiler;

/// Run a susee build from an in-memory [`SuSeeConfig`].
///
/// Mirrors `build(options)` (with a provided config) from
/// `src/nodejs/index.ts`.
///
/// # Errors
/// Returns `Err(message)` when the config is invalid (duplicate export
/// paths, missing entry file, etc.) or the compiler fails (I/O, bundler,
/// emit).
///
/// The function does **not** exit the process. For the CLI command that
/// exits on error, use [`crate::cli::build::cli_build`].
///
/// # Example
/// ```no_run
/// use susee::api::build;
/// use susee::cli::config::{SuSeeConfig, EntryPoint};
///
/// let cfg = SuSeeConfig {
///     entry_points: vec![EntryPoint {
///         entry: "src/index.ts".to_string(),
///         export_path: ".".to_string(),
///         ..Default::default()
///     }],
///     ..Default::default()
/// };
/// build(&cfg).expect("build failed");
/// ```
pub fn build(config: &SuSeeConfig) -> Result<(), String> {
    let start = Instant::now();
    let build_options = generate_build_options(config)?;

    let mut compiler = Compiler::new(build_options);
    compiler
        .compile()
        .map_err(|e| format!("build failed: {e}"))?;

    let elapsed = start.elapsed().as_secs_f64();
    eprintln!("[Build]  {elapsed:.2}s");
    Ok(())
}

/// Run a susee build from a `susee.config.json` file on disk.
///
/// This is the programmatic equivalent of the CLI `susee` command (with no
/// arguments) — it discovers and loads `susee.config.json` from the
/// current directory, then runs the compiler.
///
/// # Resolution order
/// 1. If `path` is given, read that file.
/// 2. Otherwise discover `susee.config.json` via [`get_susee_config_path`].
/// 3. If no config file is found, return `Err`.
///
/// # Errors
/// Returns `Err(message)` when no config file is found, the file is
/// invalid, or the compiler fails.
///
/// # Arguments
/// * `path` — An optional explicit path to a `susee.config.json`. When
///   `None`, the default discovery (`susee.config.json` in the current
///   directory) is used.
///
/// # Example
/// ```no_run
/// use susee::api::build_from_config_file;
///
/// // Use the default `susee.config.json` in the cwd:
/// build_from_config_file(None).expect("build failed");
///
/// // Or an explicit path:
/// build_from_config_file(Some("config/susee.config.json")).expect("build failed");
/// ```
pub fn build_from_config_file(path: Option<&str>) -> Result<(), String> {
    let start = Instant::now();

    let config_path = match path {
        Some(p) => {
            let p = Path::new(p);
            if !p.exists() {
                return Err(format!("Config file {} does not exist", p.display()));
            }
            p.to_path_buf()
        }
        None => get_susee_config_path().ok_or_else(|| {
            "No susee.config file (\"susee.config.json\") found.\n\
             Use `susee init` to create config file."
                .to_string()
        })?,
    };

    let config = read_config_file(&config_path)?;
    let build_options = generate_build_options(&config)?;

    let mut compiler = Compiler::new(build_options);
    compiler
        .compile()
        .map_err(|e| format!("build failed: {e}"))?;

    let elapsed = start.elapsed().as_secs_f64();
    eprintln!("[Build]  {elapsed:.2}s");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::config::EntryPoint;
    use crate::compiler::types::OutputFormat;

    /// `build()` changes `current_dir` and the cli module's tests resolve
    /// paths relative to the workspace cwd, so we share the cli module's
    /// `CWD_TEST_MUTEX` to avoid races.
    use crate::cli::CWD_TEST_MUTEX;

    fn make_config(entry: &str) -> SuSeeConfig {
        SuSeeConfig {
            entry_points: vec![EntryPoint {
                entry: entry.to_string(),
                export_path: ".".to_string(),
                format: Some(vec![OutputFormat::Esm]),
                tsconfig_file_path: None,
                warning: None,
            }],
            out_dir: Some("dist".to_string()),
            allow_update_package_json: Some(false),
        }
    }

    /// `build(&cfg)` with a valid in-memory config should run the compiler.
    #[test]
    fn build_with_explicit_config_succeeds() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();

        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();

        std::fs::write(tmp.path().join("entry.ts"), "export const x = 1;\n").unwrap();

        let result = build(&make_config("entry.ts"));
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);

        assert!(result.is_ok(), "build should succeed: {:?}", result.err());
        assert!(tmp.path().join("dist").join("entry.mjs").exists());
    }

    /// `build(&cfg)` with a missing entry file should return an error.
    #[test]
    fn build_with_invalid_config_returns_err() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();

        let result = build(&make_config("does/not/exist.ts"));
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("dose not exists"));
    }

    /// `build_from_config_file(None)` with no config on disk returns an
    /// error (not exit), so programmatic callers can handle it.
    #[test]
    fn build_from_config_file_none_when_absent_returns_err() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();

        let result = build_from_config_file(None);
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("config file"));
    }

    /// `build_from_config_file(None)` with a `susee.config.json` on disk
    /// should load it and run the compiler.
    #[test]
    fn build_from_config_file_default_discovery_succeeds() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();

        std::fs::write(tmp.path().join("entry.ts"), "export const x = 1;\n").unwrap();
        std::fs::write(
            tmp.path().join("susee.config.json"),
            r#"{
                "entryPoints": [
                    { "entry": "entry.ts", "exportPath": ".", "format": ["esm"] }
                ],
                "outDir": "dist",
                "allowUpdatePackageJson": false
            }"#,
        )
        .unwrap();

        let result = build_from_config_file(None);
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);

        assert!(result.is_ok(), "build should succeed: {:?}", result.err());
        assert!(tmp.path().join("dist").join("entry.mjs").exists());
    }

    /// `build_from_config_file(Some(path))` with an explicit path works.
    #[test]
    fn build_from_config_file_explicit_path_succeeds() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();

        std::fs::write(tmp.path().join("entry.ts"), "export const x = 1;\n").unwrap();
        let cfg_path = tmp.path().join("my-config.json");
        std::fs::write(
            &cfg_path,
            r#"{
                "entryPoints": [
                    { "entry": "entry.ts", "exportPath": "." }
                ],
                "outDir": "out"
            }"#,
        )
        .unwrap();

        let result = build_from_config_file(Some(cfg_path.to_str().unwrap()));
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);

        assert!(result.is_ok(), "build should succeed: {:?}", result.err());
        assert!(tmp.path().join("out").join("entry.mjs").exists());
    }

    /// `build_from_config_file(Some(path))` with a non-existent path
    /// returns an error.
    #[test]
    fn build_from_config_file_explicit_missing_returns_err() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();

        let result = build_from_config_file(Some("nope.json"));
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }
}
