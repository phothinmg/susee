// #![allow(dead_code)]
use std::path::PathBuf;

use napi_derive::napi;
use serde::{Deserialize, Serialize};

/// Output module formats supported by the compiler.
///
/// Mirrors `OutputFormat = ("commonjs" | "esm")[]` from the TS config.
/// Serialized as lowercase strings to match the JSON config form.
#[napi]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum OutputFormat {
    Commonjs,
    #[default]
    Esm,
}

impl OutputFormat {
    /// Return the canonical string label used in logs and file extensions.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Commonjs => "commonjs",
            Self::Esm => "esm",
        }
    }

    /// The primary file extension used for the emitted module file:
    /// `.cjs` for CommonJS, `.mjs` for ESM.
    pub fn module_ext(&self) -> &'static str {
        match self {
            Self::Commonjs => ".cjs",
            Self::Esm => ".mjs",
        }
    }

    /// The extension used for the type declaration file:
    /// `.d.cts` for CommonJS, `.d.mts` for ESM.
    pub fn dts_ext(&self) -> &'static str {
        match self {
            Self::Commonjs => ".d.cts",
            Self::Esm => ".d.mts",
        }
    }

    /// The extension used for the source map file.
    pub fn map_ext(&self) -> &'static str {
        match self {
            Self::Commonjs => ".cjs.map",
            Self::Esm => ".mjs.map",
        }
    }
}

/// A single normalized build entry point.
///
/// Mirrors `BuildEntryPoint` from `src/nodejs/config/index.ts`.
///
/// Implements `Debug` manually because `Box<dyn Plugin>` is not `Debug`;
/// the plugin list is summarized as its length.
pub struct BuildEntryPoint {
    /// Entry file path (relative to the project root).
    pub entry: String,
    /// Package export path (`.` or `./sub/path`).
    pub export_path: String,
    /// Output formats to emit for this entry. Defaults to `[Esm]`.
    pub format: Vec<OutputFormat>,
    /// Optional custom tsconfig file path.
    pub tsconfig_file_path: Option<String>,
    /// Output directory for this entry point.
    pub output_directory_path: String,
    /// Whether to treat missing-dependency warnings as fatal.
    pub warning: bool,
}

impl std::fmt::Debug for BuildEntryPoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BuildEntryPoint")
            .field("entry", &self.entry)
            .field("export_path", &self.export_path)
            .field("format", &self.format)
            .field("tsconfig_file_path", &self.tsconfig_file_path)
            .field("output_directory_path", &self.output_directory_path)
            .field("warning", &self.warning)
            .finish()
    }
}

impl BuildEntryPoint {
    /// `true` when this entry is the package main (`export_path == "."`).
    pub fn is_main(&self) -> bool {
        self.export_path == "."
    }
}

impl Default for BuildEntryPoint {
    fn default() -> Self {
        Self {
            entry: String::new(),
            export_path: ".".to_string(),
            format: Vec::new(),
            tsconfig_file_path: None,
            output_directory_path: "dist".to_string(),
            warning: false,
        }
    }
}

/// Normalized build options for the whole build.
///
/// Mirrors `BuildOptions` from `src/nodejs/config/index.ts`.
#[derive(Default)]
pub struct BuildOptions {
    pub build_entry_points: Vec<BuildEntryPoint>,
    pub update_package: bool,
    pub out_dir: String,
    pub minify: bool,
    /// When `true`, run the `susee_check` diagnostics after generating
    /// `susee_tree` and exit with code 1 if any issue is found.
    pub check: bool,
}

impl std::fmt::Debug for BuildOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BuildOptions")
            .field("build_entry_points", &self.build_entry_points)
            .field("update_package", &self.update_package)
            .field("out_dir", &self.out_dir)
            .field("minify", &self.minify)
            .field("check", &self.check)
            .finish()
    }
}

/// A single entry point in the raw config, mirroring `EntryPoint` from
/// `src/nodejs/config/index.ts`.
///
/// JSON field names use camelCase to match the TS `SuSeeConfig` interface
/// (e.g. `entryPoints`, `exportPath`).
#[napi(object)]
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
#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuSeeConfig {
    pub entry_points: Vec<EntryPoint>,
    #[serde(default)]
    pub out_dir: Option<String>,
    #[serde(default)]
    pub allow_update_package_json: Option<bool>,
    #[serde(default)]
    pub minify: Option<bool>,
    /// Run the `susee_check` diagnostics after generating `susee_tree`.
    /// When `true` and issues are found, the build exits with code 1.
    #[serde(default)]
    pub check: Option<bool>,
}

/// Look for `susee.config.json` in `cwd`, mirroring `getSuseeConfigPath`.
///
/// The TS version checks `susee.config.ts|js|mjs`; here we check the JSON
/// form only.
pub fn get_susee_config_path() -> Option<PathBuf> {
    let candidates = ["susee.config.jsonc"];
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
        });
    }

    Ok(BuildOptions {
        build_entry_points: points,
        update_package: config.allow_update_package_json.unwrap_or(false),
        out_dir,
        minify: config.minify.unwrap_or(false),
        // susee_check runs by default so issues surface during a normal
        // build. Opt out with `"check": false` in susee.config.jsonc.
        check: config.check.unwrap_or(false),
    })
}

/// Read and parse a `susee.config.json` file from `path`.
///
/// Returns the raw [`SuSeeConfig`] (not yet normalized into
/// [`BuildOptions`]). Callers run [`generate_build_options`] to validate
/// and normalize.
///
/// Exposed so the programmatic API ([`crate::api::build_from_config_file`])
/// can read a config from an explicit path without re-implementing the
/// JSON parsing.
pub fn read_config_file(path: &std::path::Path) -> Result<SuSeeConfig, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    // `susee.config.jsonc` may contain JSONC-style comments (`//` and
    // `/* */`); strip them before handing the text to the strict
    // `serde_json` parser, mirroring how `read_tsconfig` handles
    // `tsconfig.json` with comments.
    let clean = super::ts_options::strip_jsonc_comments(&text);
    let config: SuSeeConfig = serde_json::from_str(&clean)
        .map_err(|e| format!("failed to parse {}: {e}", path.display()))?;
    Ok(config)
}

/// Load and normalize the susee config from disk, mirroring
/// `finalSuseeConfig`.
///
/// Returns `Ok(None)` when no config file is found (the caller decides how
/// to handle that), and `Err(message)` when a config file is found but is
/// invalid.
// pub fn final_susee_config() -> Result<Option<BuildOptions>, String> {
//     let Some(path) = get_susee_config_path() else {
//         return Ok(None);
//     };
//     let config = read_config_file(&path)?;
//     Ok(Some(generate_build_options(&config)?))
// }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_config_file_strips_jsonc_comments() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("susee.config.jsonc");
        std::fs::write(
            &path,
            r#"{
                // Entry points for the build
                "entryPoints": [
                    {
                        "entry": "src/index.ts",
                        "exportPath": ".",
                        /* ESM + CJS */ "format": ["esm", "commonjs"],
                        "tsconfigFilePath": null,
                        "warning": false
                    }
                ],
                "outDir": "dist", // output directory
                "allowUpdatePackageJson": true
            }"#,
        )
        .unwrap();
        let config = read_config_file(&path).unwrap();
        assert_eq!(config.entry_points.len(), 1);
        assert_eq!(config.entry_points[0].entry, "src/index.ts");
        assert_eq!(config.out_dir.as_deref(), Some("dist"));
        assert!(config.allow_update_package_json.unwrap_or(false));
    }
}
