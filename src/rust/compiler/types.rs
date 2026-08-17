//! Shared types for the compiler pipeline.
//!
//! Ported from `src/nodejs/config/index.ts` (`SuSeeConfig`, `EntryPoint`,
//! `BuildEntryPoint`, `BuildOptions`) and the TS `Compiler` class
//! (`OutFiles`).

use serde::{Deserialize, Serialize};

use crate::plugins::Plugin;

/// Output module formats supported by the compiler.
///
/// Mirrors `OutputFormat = ("commonjs" | "esm")[]` from the TS config.
/// Serialized as lowercase strings to match the JSON config form.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Commonjs,
    Esm,
}

impl Default for OutputFormat {
    fn default() -> Self {
        Self::Esm
    }
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
    /// Plugins attached to this entry point, mirroring the `plugins` field
    /// on `BuildEntryPoint` in the TS config. Stored as trait objects so
    /// built-in and user plugins share one list.
    pub plugins: Vec<Box<dyn Plugin>>,
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
            .field("plugins", &format!("<{} plugin(s)>", self.plugins.len()))
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
            plugins: Vec::new(),
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

/// Emitted artifact paths, mirroring `files.OutFiles` from the TS helpers.
///
/// Each field is `Some(path)` once the corresponding output has been written.
#[derive(Debug, Clone, Default)]
pub struct OutFiles {
    pub commonjs: Option<String>,
    pub commonjs_types: Option<String>,
    pub esm: Option<String>,
    pub esm_types: Option<String>,
    pub main: Option<String>,
    pub module: Option<String>,
    pub types: Option<String>,
}
