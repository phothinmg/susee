use serde::{Deserialize, Serialize};

/// Output module formats supported by the compiler.
///
/// Mirrors `OutputFormat = ("commonjs" | "esm")[]` from the TS config.
/// Serialized as lowercase strings to match the JSON config form.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Esm,
    Commonjs
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