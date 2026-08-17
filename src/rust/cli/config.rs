//! Susee config file loader.
//!
//! Ported from `finalSuseeConfig` / `getSuseeConfigPath` /
//! `generateBuildOptions` / `checkEntries` in
//! `src/nodejs/config/index.ts`.
//!
//! The TS version supports `susee.config.ts|js|mjs` loaded via dynamic
//! `import()`. The Rust port cannot evaluate JS/TS, so it supports a JSON
//! form (`susee.config.json`) whose shape mirrors the `SuSeeConfig` TS
//! interface. Authors who want the TS config file can keep using the JS CLI
//! (`bin/susee`); the native Rust binary targets the JSON form for
//! non-JS environments and for CI.
//!
//! The JSON schema (mirrors `SuSeeConfig`):
//! ```json
//! {
//!   "entryPoints": [
//!     {
//!       "entry": "src/index.ts",
//!       "exportPath": ".",
//!       "format": ["esm"],
//!       "tsconfigFilePath": null,
//!       "warning": false
//!     }
//!   ],
//!   "outDir": "dist",
//!   "allowUpdatePackageJson": false
//! }
//! ```

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::compiler::types::{BuildEntryPoint, BuildOptions, OutputFormat};

/// A single entry point in the raw config, mirroring `EntryPoint` from
/// `src/nodejs/config/index.ts`.
///
/// JSON field names use camelCase to match the TS `SuSeeConfig` interface
/// (e.g. `entryPoints`, `exportPath`).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryPoint {
    pub entry: String,
    pub export_path: String,
    #[serde(default)]
    pub format: Option<Vec<OutputFormat>>,
    #[serde(default)]
    pub tsconfig_file_path: Option<String>,
    #[serde(default)]
    pub warning: Option<bool>,
}

/// The raw susee config, mirroring `SuSeeConfig`.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuSeeConfig {
    pub entry_points: Vec<EntryPoint>,
    #[serde(default)]
    pub out_dir: Option<String>,
    #[serde(default)]
    pub allow_update_package_json: Option<bool>,
}

/// Look for `susee.config.json` in `cwd`, mirroring `getSuseeConfigPath`.
///
/// The TS version checks `susee.config.ts|js|mjs`; here we check the JSON
/// form only.
pub fn get_susee_config_path() -> Option<PathBuf> {
    let candidates = ["susee.config.json"];
    let cwd = std::env::current_dir().ok()?;
    for name in candidates {
        let p = cwd.join(name);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Validate the entry points, mirroring `checkEntries`.
///
/// Errors via the returned `String`; callers decide whether to print or
/// exit. The TS version calls `process.exit(1)` directly; here we surface
/// the error so the CLI dispatcher can format it consistently.
fn check_entries(entries: &[EntryPoint]) -> Result<(), String> {
    if entries.is_empty() {
        return Err(
            "No entry found in susee.config file or build options, at least one entry required"
                .to_string(),
        );
    }

    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut duplicates: Vec<String> = Vec::new();
    for ent in entries {
        if !seen.insert(ent.export_path.clone()) {
            duplicates.push(format!("\"{}\"", ent.export_path));
        }
    }
    if !duplicates.is_empty() {
        return Err(format!(
            "Duplicate export paths/path ({}) found in your susee.config file or build options , that will error for bundled output",
            duplicates.join(",")
        ));
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for ent in entries {
        let p = cwd.join(&ent.entry);
        if !p.exists() {
            return Err(format!("Entry file {} dose not exists.", ent.entry));
        }
    }
    Ok(())
}

/// Normalize a raw [`SuSeeConfig`] into [`BuildOptions`], mirroring
/// `generateBuildOptions`.
pub fn generate_build_options(config: &SuSeeConfig) -> Result<BuildOptions, String> {
    let out_dir = config.out_dir.clone().unwrap_or_else(|| "dist".to_string());
    check_entries(&config.entry_points)?;

    let mut points: Vec<BuildEntryPoint> = Vec::with_capacity(config.entry_points.len());
    for ent in &config.entry_points {
        let format = ent
            .format
            .clone()
            .unwrap_or_else(|| vec![OutputFormat::Esm]);
        // De-duplicate formats, mirroring `[...new Set(ent.format)]`.
        let mut seen: Vec<OutputFormat> = Vec::with_capacity(format.len());
        for f in &format {
            if !seen.contains(f) {
                seen.push(*f);
            }
        }
        let warning = ent.warning.unwrap_or(false);
        let tsconfig_file_path = ent.tsconfig_file_path.clone();
        let output_directory_path = if ent.export_path == "." {
            out_dir.clone()
        } else {
            // export_path starts with "./" — strip the leading "." and join.
            let suffix = ent
                .export_path
                .strip_prefix('.')
                .unwrap_or(&ent.export_path);
            format!("{out_dir}{suffix}")
        };
        points.push(BuildEntryPoint {
            entry: ent.entry.clone(),
            export_path: ent.export_path.clone(),
            format: seen,
            tsconfig_file_path,
            output_directory_path,
            warning,
            plugins: Vec::new(),
        });
    }

    Ok(BuildOptions {
        build_entry_points: points,
        update_package: config.allow_update_package_json.unwrap_or(false),
        out_dir,
    })
}

/// Load and normalize the susee config from disk, mirroring
/// `finalSuseeConfig`.
///
/// Returns `Ok(None)` when no config file is found (the caller decides how
/// to handle that), and `Err(message)` when a config file is found but is
/// invalid.
pub fn final_susee_config() -> Result<Option<BuildOptions>, String> {
    let Some(path) = get_susee_config_path() else {
        return Ok(None);
    };
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    let config: SuSeeConfig = serde_json::from_str(&text)
        .map_err(|e| format!("failed to parse {}: {e}", path.display()))?;
    Ok(Some(generate_build_options(&config)?))
}

#[cfg(test)]
mod tests {
    use super::super::CWD_TEST_MUTEX;
    use super::*;

    fn cfg_entry(entry: &str, export_path: &str) -> EntryPoint {
        EntryPoint {
            entry: entry.to_string(),
            export_path: export_path.to_string(),
            format: None,
            tsconfig_file_path: None,
            warning: None,
        }
    }

    #[test]
    fn empty_entries_rejected() {
        let cfg = SuSeeConfig {
            entry_points: vec![],
            out_dir: None,
            allow_update_package_json: None,
        };
        assert!(generate_build_options(&cfg).is_err());
    }

    #[test]
    fn duplicate_export_paths_rejected() {
        let cfg = SuSeeConfig {
            entry_points: vec![cfg_entry("a.ts", "."), cfg_entry("b.ts", ".")],
            out_dir: None,
            allow_update_package_json: None,
        };
        let err = generate_build_options(&cfg).unwrap_err();
        assert!(err.contains("Duplicate"));
    }

    #[test]
    fn format_defaults_to_esm() {
        // Use existing workspace file to pass the file-exists check.
        let cfg = SuSeeConfig {
            entry_points: vec![cfg_entry("src/rust/lib.rs", ".")],
            out_dir: None,
            allow_update_package_json: None,
        };
        let opts = generate_build_options(&cfg).unwrap();
        assert_eq!(opts.build_entry_points[0].format, vec![OutputFormat::Esm]);
    }

    #[test]
    fn format_de_duplicates() {
        let mut ent = cfg_entry("src/rust/lib.rs", ".");
        ent.format = Some(vec![
            OutputFormat::Esm,
            OutputFormat::Esm,
            OutputFormat::Commonjs,
        ]);
        let cfg = SuSeeConfig {
            entry_points: vec![ent],
            out_dir: None,
            allow_update_package_json: None,
        };
        let opts = generate_build_options(&cfg).unwrap();
        assert_eq!(
            opts.build_entry_points[0].format,
            vec![OutputFormat::Esm, OutputFormat::Commonjs]
        );
    }

    #[test]
    fn subpath_output_dir_joins_correctly() {
        let mut ent = cfg_entry("src/rust/lib.rs", "./sub");
        ent.format = Some(vec![OutputFormat::Esm]);
        let cfg = SuSeeConfig {
            entry_points: vec![ent],
            out_dir: Some("build".to_string()),
            allow_update_package_json: None,
        };
        let opts = generate_build_options(&cfg).unwrap();
        assert_eq!(
            opts.build_entry_points[0].output_directory_path,
            "build/sub"
        );
    }

    #[test]
    fn final_susee_config_returns_none_when_absent() {
        // Run in a tmp cwd with no config. Hold the CWD mutex so concurrent
        // tests using relative paths don't race with our cwd change.
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();
        let res = final_susee_config();
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);
        assert!(matches!(res, Ok(None)));
    }

    #[test]
    fn final_susee_config_loads_json() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let cfg_path = tmp.path().join("susee.config.json");
        std::fs::write(
            &cfg_path,
            r#"{
                "entryPoints": [
                    { "entry": "src/rust/lib.rs", "exportPath": "." }
                ],
                "outDir": "out",
                "allowUpdatePackageJson": true
            }"#,
        )
        .unwrap();
        // Need a file the entry can resolve to relative to tmp cwd.
        std::fs::create_dir_all(tmp.path().join("src/rust")).unwrap();
        std::fs::write(tmp.path().join("src/rust/lib.rs"), "// hi").unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();
        let res = final_susee_config();
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);
        let opts = res.unwrap().unwrap();
        assert_eq!(opts.out_dir, "out");
        assert!(opts.update_package);
        assert_eq!(opts.build_entry_points.len(), 1);
    }

    #[test]
    fn missing_entry_file_rejected() {
        let cfg = SuSeeConfig {
            entry_points: vec![cfg_entry("does/not/exist.ts", ".")],
            out_dir: None,
            allow_update_package_json: None,
        };
        let err = generate_build_options(&cfg).unwrap_err();
        assert!(err.contains("dose not exists"));
    }
}
