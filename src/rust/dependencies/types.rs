//! Shared types for the dependency collection pipeline.
//!
//! Ported from the `@suseejs/type` definitions used by
//! `node_src/dependencies/index.ts` and `node_src/dependencies/duplicates.ts`.

use serde::{Deserialize, Serialize};

/// File extensions considered valid for JS/TS/JSON modules.
///
/// Mirrors `ValidExts` from `@suseejs/type`.
///
/// Serialized as a string with a leading dot (e.g. `".ts"`) to match the
/// TypeScript `fileExt` field in `DepsFile`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ValidExts {
    Js,
    Cjs,
    Mjs,
    Ts,
    Cts,
    Mts,
    Tsx,
    Jsx,
    Json,
}

impl Serialize for ValidExts {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_ext_str())
    }
}

impl<'de> Deserialize<'de> for ValidExts {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        ValidExts::from_path_ext(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown file extension: {s}")))
    }
}

impl ValidExts {
    /// Parse an extension (without leading dot) into a [`ValidExts`].
    pub fn from_ext(ext: &str) -> Option<Self> {
        Some(match ext {
            "js" => Self::Js,
            "cjs" => Self::Cjs,
            "mjs" => Self::Mjs,
            "ts" => Self::Ts,
            "cts" => Self::Cts,
            "mts" => Self::Mts,
            "tsx" => Self::Tsx,
            "jsx" => Self::Jsx,
            "json" => Self::Json,
            _ => return None,
        })
    }

    /// Parse a file extension including the leading dot (e.g. `.ts`).
    pub fn from_path_ext(ext: &str) -> Option<Self> {
        let trimmed = ext.strip_prefix('.').unwrap_or(ext);
        Self::from_ext(trimmed)
    }

    /// Return the extension including the leading dot (e.g. `.ts`).
    #[allow(dead_code)]
    pub fn as_ext_str(&self) -> &'static str {
        match self {
            Self::Js => ".js",
            Self::Cjs => ".cjs",
            Self::Mjs => ".mjs",
            Self::Ts => ".ts",
            Self::Cts => ".cts",
            Self::Mts => ".mts",
            Self::Tsx => ".tsx",
            Self::Jsx => ".jsx",
            Self::Json => ".json",
        }
    }
}

/// The module system a file uses.
///
/// Mirrors `moduleType` on `DepsFile` from `@suseejs/type`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModuleType {
    Cjs,
    Esm,
    Json,
}

impl ModuleType {
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Cjs => "cjs",
            Self::Esm => "esm",
            Self::Json => "json",
        }
    }
}

/// A single dependency file entry in the dependency tree.
///
/// Mirrors `DepsFile` from `@suseejs/type`.
///
/// All JSON fields use `snake_case` (e.g. `module_type`, `file_ext`,
/// `is_jsx`, `is_entry`) for a consistent naming convention.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepsFile {
    /// File path relative to the project root (using `/` separators).
    pub file: String,
    /// File contents as a UTF-8 string.
    pub content: String,
    /// File size in bytes.
    pub bytes: usize,
    /// Module format (cjs / esm / json).
    pub module_type: ModuleType,
    /// Resolved file extension.
    pub file_ext: ValidExts,
    /// Whether the file contains JSX syntax.
    pub is_jsx: bool,
    /// Whether this is the entry file.
    pub is_entry: bool,
}

/// The full dependency tree built from a project entry point.
///
/// Mirrors `DependenciesTree` from `@suseejs/type`.
///
/// All JSON fields use `snake_case` for a consistent naming convention.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependenciesTree {
    /// The entry file path (relative to root).
    pub entry: String,
    /// NPM dependencies referenced by the entry and its dependencies.
    pub npm: Vec<String>,
    /// Node.js built-in modules referenced.
    pub nodes: Vec<String>,
    /// Unknown/unresolved module specifiers collected as warnings.
    pub warns: Vec<String>,
    /// The sorted list of dependency files.
    pub dep_files: Vec<DepsFile>,
}
