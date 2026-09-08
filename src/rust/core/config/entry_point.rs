use super::out_format::OutputFormat;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use crate::core::bundle::tree::CheckOptions;

// ------------------------
// oxc minify config
// ------------------------

/// Minify configuration matching the TS type `boolean | { options: MinifyOptions }`.
///
/// `#[serde(untagged)]` lets serde try `bool` first, then the object form.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum MinifyConfig {
    Enabled(bool),
    WithOptions { options: MinifyOptions },
}

/// Serializable mirror of `oxc-minify`'s `MinifyOptions` (the npm package type),
/// which is a subset of oxc's `oxc::minifier::MinifierOptions`.
///
/// Only fields that make sense as user-facing config are exposed; the rest fall
/// back to oxc defaults when converted via `MinifyOptions::to_oxc`.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinifyOptions {
    /// Use when minifying an ES module.
    pub module: Option<bool>,
    pub compress: Option<CompressOptions>,
    pub mangle: Option<MangleOptions>,
    pub codegen: Option<CodegenOptions>,
    pub sourcemap: Option<bool>,
}

/// Mirror of `oxc-minify`'s `CompressOptions`.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressOptions {
    pub drop_debugger: Option<bool>,
    pub drop_console: Option<bool>,
    pub join_vars: Option<bool>,
    pub sequences: Option<bool>,
    pub unused: Option<CompressUnused>,
    pub keep_names: Option<CompressKeepNames>,
    pub drop_labels: Option<Vec<String>>,
    pub max_iterations: Option<u8>,
    pub treeshake: Option<TreeShakeOptions>,
}

/// Mirror of `oxc-minify`'s `unused` field (boolean | 'keep_assign').
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CompressUnused {
    Remove,
    KeepAssign,
    Keep,
}

/// Mirror of `oxc-minify`'s `CompressOptionsKeepNames`.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct CompressKeepNames {
    pub function: bool,
    pub class: bool,
}

/// Mirror of `oxc-minify`'s `MangleOptions`.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangleOptions {
    pub toplevel: Option<bool>,
    pub keep_names: Option<MangleKeepNames>,
    pub reserved: Option<Vec<String>>,
    pub debug: Option<bool>,
}

/// Mirror of `oxc-minify`'s `MangleOptionsKeepNames`.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct MangleKeepNames {
    pub function: bool,
    pub class: bool,
}

/// Mirror of `oxc-minify`'s `CodegenOptions`.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodegenOptions {
    pub remove_whitespace: Option<bool>,
    pub legal_comments: Option<LegalComments>,
}

/// Legal comment handling modes.
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LegalComments {
    None,
    Inline,
    Eof,
    External,
}

/// Mirror of `oxc-minify`'s `TreeShakeOptions`.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeShakeOptions {
    pub annotations: Option<bool>,
    pub manual_pure_functions: Option<Vec<String>>,
    pub property_read_side_effects: Option<TreeShakePropertyRead>,
    pub property_write_side_effects: Option<bool>,
    pub unknown_global_side_effects: Option<bool>,
}

/// Mirror of `propertyReadSideEffects` (boolean | 'always').
#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TreeShakePropertyRead {
    Always,
    True,
    False,
}


// -------------------------------------------
//                Susee Config
// ------------------------------------------

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryPoint {
    /// Entry file path (relative to the project root).
    pub entry: String,
    /// Package export path (`.` or `./sub/path`).
    pub export_path: String,
    /// Output formats to emit for this entry. Defaults to `[Esm]`.
    pub format: Option<Vec<OutputFormat>>,
    /// Optional custom tsconfig file path.
    pub tsconfig_file_path: Option<String>,
    /// Lint checks to run on the bundled output.
    /// default - { checkAnonymous: false, checkDefaultExports: false, checkNpmInstalled: false }
    pub check: Option<CheckOptions>,
    /// Minify the bundled output.
    ///
    /// Pass `true` for default minification, or an object with custom `MinifyOptions`.
    /// default - false
    pub minify: Option<MinifyConfig>,
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
    /// Lint checks to run on the bundled output.
    /// default - { checkAnonymous: false, checkDefaultExports: false, checkNpmInstalled: false }
    pub check: CheckOptions,
    /// Minify the bundled output.
    ///
    /// Pass `true` for default minification, or an object with custom `MinifyOptions`.
    /// default - false
    pub minify: MinifyConfig,
}

impl std::fmt::Debug for BuildEntryPoint {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BuildEntryPoint")
            .field("entry", &self.entry)
            .field("export_path", &self.export_path)
            .field("format", &self.format)
            .field("tsconfig_file_path", &self.tsconfig_file_path)
            .field("output_directory_path", &self.output_directory_path)
            .field("check", &self.check)
            .field("minify", &self.minify)
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
            format: [OutputFormat::default()].to_vec(),
            tsconfig_file_path: None,
            output_directory_path: "dist".to_string(),
            minify: MinifyConfig::Enabled(false),
            check: CheckOptions::default(),
        }
    }
}
/// Normalized build options for the whole build.
///
/// Mirrors `BuildOptions` from `src/nodejs/config/index.ts`.
pub struct BuildOptions {
    pub build_entry_points: Vec<BuildEntryPoint>,
    pub update_package: bool,
    pub out_dir: String,
}
impl std::fmt::Debug for BuildOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BuildOptions")
            .field("build_entry_points", &self.build_entry_points)
            .field("update_package", &self.update_package)
            .field("out_dir", &self.out_dir)
            .finish()
    }
}
impl Default for BuildOptions {
    fn default() -> Self {
        Self {
            build_entry_points: Vec::new(),
            update_package: false,
            out_dir: String::new(),
        }
    }
}
pub fn get_susee_config_path() -> Option<PathBuf> {
    let file_names = ["susee.config.ts", "susee.config.js", "susee.config.mjs"];
    let cwd = std::env::current_dir().ok()?;
    for name in file_names {
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

pub fn generate_build_options(config: &SuSeeConfig)-> Result<BuildOptions, String> {
    let out_dir = config.out_dir.clone().unwrap_or_else(|| "dist".to_string());
    let _ = check_entries(&config.entry_points).unwrap();
    let mut points: Vec<BuildEntryPoint> = Vec::with_capacity(config.entry_points.len());
    for ent in &config.entry_points {
        let format: Vec<OutputFormat> = if ent.format.is_none() {
            [OutputFormat::default()].to_vec()
        } else {
            ent.format.clone().unwrap()
        };
        let mut seen: Vec<OutputFormat> = Vec::with_capacity(format.len());
        for f in &format {
            if !seen.contains(f) {
                seen.push(*f);
            }
        }
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
        let minify:MinifyConfig = if ent.minify.is_none() {
            MinifyConfig::Enabled(false)
        } else {
            ent.minify.clone().unwrap()
        };
        let check:CheckOptions = if ent.check.is_none() {
            CheckOptions::default()
        } else {
            ent.check.clone().unwrap()
        };
         points.push(BuildEntryPoint {
            entry: ent.entry.clone(),
            export_path: ent.export_path.clone(),
            format: seen,
            tsconfig_file_path,
            output_directory_path,
            minify,check
        });

    }
      Ok(BuildOptions {
        build_entry_points: points,
        update_package: config.allow_update_package_json.unwrap_or(false),
        out_dir,
    })
}
