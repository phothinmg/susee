//! JS-facing types for the `dependency` plugin hook.
//!
//! These are the susee-native replacements for the `@suseejs/type` plugin
//! argument types (`DepsFiles`, `ts.CompilerOptions`). They let a JS plugin
//! author inspect and mutate the dependency tree, npm deps, node builtins,
//! and warnings — without any TS API.
//!
//! ## Why `Arc<Mutex<...>>`
//!
//! JS holds a `DepsFileEntry` / `DepsFiles` object across multiple napi
//! calls, and the Rust `JsPlugin` adapter (see
//! [`crate::plugins::js_plugin`]) needs to read back mutations after the JS
//! hook returns. To share the same data between the JS-owned napi object
//! and the Rust adapter, each entry is an
//! `Arc<Mutex<DepsFileEntryData>>`. Getters/setters lock, read/write, and
//! unlock per call — coarse but correct.
//!
//! ## Exposed API
//! - [`DepsFiles`] — the array-like container passed to the `dependency`
//!   hook. Supports indexed get/set, `length`, `push`, `removeAt`,
//!   `insertAt`, plus npm/node-builtin/warning management.
//! - [`DepsFileEntry`] — a single dependency file (path, content, module
//!   type, isEntry, isJsx, fileExt). Has a [`Self::parse`] method returning
//!   a [`super::SourceFile`] (reuses the oxc parser).
//! - [`SuseePluginContext`] — the context object passed to every hook,
//!   carrying `entry`, `format`, `compilerOptions`, and a `warn()` sink.
//! - [`SuseeCompilerOptions`] — the susee-native replacement for
//!   `ts.CompilerOptions`.

use std::sync::{Arc, Mutex};

use napi::bindgen_prelude::*;
use napi_derive::napi;

use super::source_file::SourceFile;
use crate::dependencies::types::{DepsFile, ModuleType, ValidExts};

// ---------------------------------------------------------------------------
// Shared mutable backing data (Rust side).
// ---------------------------------------------------------------------------

/// The Rust-owned data behind a JS [`DepsFileEntry`].
///
/// Mirrors [`crate::dependencies::types::DepsFile`] but owned behind a
/// `Mutex` so JS setters and the Rust adapter can both reach it.
#[derive(Debug, Clone)]
pub struct DepsFileEntryData {
    pub file: String,
    pub content: String,
    pub bytes: usize,
    pub module_type: ModuleType,
    pub file_ext: ValidExts,
    pub is_jsx: bool,
    pub is_entry: bool,
}

impl From<DepsFile> for DepsFileEntryData {
    fn from(d: DepsFile) -> Self {
        Self {
            file: d.file,
            content: d.content,
            bytes: d.bytes,
            module_type: d.module_type,
            file_ext: d.file_ext,
            is_jsx: d.is_jsx,
            is_entry: d.is_entry,
        }
    }
}

impl From<DepsFileEntryData> for DepsFile {
    fn from(d: DepsFileEntryData) -> Self {
        // Recompute bytes from content so JS content edits are reflected.
        let bytes = d.content.len();
        DepsFile {
            file: d.file,
            content: d.content,
            bytes,
            module_type: d.module_type,
            file_ext: d.file_ext,
            is_jsx: d.is_jsx,
            is_entry: d.is_entry,
        }
    }
}

/// The Rust-owned data behind a JS [`DepsFiles`].
///
/// Held in an `Arc<Mutex<...>>` so the [`crate::plugins::js_plugin::JsPlugin`]
/// adapter can read the post-hook state back into `Vec<DepsFile>`.
#[derive(Debug, Default)]
pub struct DepsFilesData {
    pub entries: Vec<Arc<Mutex<DepsFileEntryData>>>,
    pub npm: Vec<String>,
    pub nodes: Vec<String>,
    pub warns: Vec<String>,
}

// ---------------------------------------------------------------------------
// SuseeCompilerOptions — susee-native replacement for ts.CompilerOptions.
// ---------------------------------------------------------------------------

/// A minimal subset of compiler options exposed to JS plugins.
///
/// Replaces `ts.CompilerOptions` in the `dependency` hook. Built from the
/// Rust [`crate::compiler::options::CompilerOptions`] by the
/// [`crate::plugins::js_plugin::JsPlugin`] adapter.
#[napi(object)]
pub struct SuseeCompilerOptions {
    /// Output directory (e.g. `"dist"`).
    pub out_dir: String,
    /// Module kind: `"commonjs"` or `"es2020"`.
    pub module: Option<String>,
    /// Script target (e.g. `"latest"`, `"esnext"`).
    pub target: String,
    /// JSX emit mode if set (`"react-jsx"`, `"preserve"`, ...).
    pub jsx: Option<String>,
    /// JSX runtime import source if set.
    pub jsx_import_source: Option<String>,
    /// Libs (`dom`, `esnext`, ...).
    pub lib: Vec<String>,
    /// Whether `.js` inputs are allowed.
    pub allow_js: bool,
    /// Whether `.d.ts` declarations are emitted.
    pub declaration: bool,
    /// Whether source maps are emitted.
    pub source_map: bool,
}

impl SuseeCompilerOptions {
    /// Build the JS-facing options from the Rust compiler options.
    pub fn from_rust(o: &crate::compiler::options::CompilerOptions) -> Self {
        Self {
            out_dir: o.out_dir.clone(),
            module: o.module.map(|m| match m {
                crate::compiler::options::ModuleKind::Commonjs => "commonjs".to_string(),
                crate::compiler::options::ModuleKind::Es2020 => "es2020".to_string(),
            }),
            target: o.target.clone(),
            jsx: o.jsx.clone(),
            jsx_import_source: o.jsx_import_source.clone(),
            lib: o.lib.clone(),
            allow_js: o.allow_js,
            declaration: o.declaration,
            source_map: o.source_map,
        }
    }
}

// ---------------------------------------------------------------------------
// DepsFileEntry — a single dependency file, JS-mutable.
// ---------------------------------------------------------------------------

/// A single dependency file entry in the [`DepsFiles`] tree.
///
/// JS plugins read and write its fields via getters/setters; the Rust
/// adapter reads the final state back after the hook returns.
#[napi]
pub struct DepsFileEntry {
    pub(crate) data: Arc<Mutex<DepsFileEntryData>>,
}

#[napi]
impl DepsFileEntry {
    /// File path relative to the project root.
    #[napi(getter)]
    pub fn file(&self) -> Result<String> {
        Ok(self.data.lock().map_err(lock_err)?.file.clone())
    }
    #[napi(setter)]
    pub fn set_file(&self, value: String) -> Result<()> {
        self.data.lock().map_err(lock_err)?.file = value;
        Ok(())
    }

    /// File contents as a UTF-8 string.
    #[napi(getter)]
    pub fn content(&self) -> Result<String> {
        Ok(self.data.lock().map_err(lock_err)?.content.clone())
    }
    #[napi(setter)]
    pub fn set_content(&self, value: String) -> Result<()> {
        let mut g = self.data.lock().map_err(lock_err)?;
        g.content = value;
        g.bytes = g.content.len();
        Ok(())
    }

    /// File size in bytes (read-only; recomputed from `content`).
    #[napi(getter)]
    pub fn bytes(&self) -> Result<usize> {
        Ok(self.data.lock().map_err(lock_err)?.bytes)
    }

    /// Module format: `"cjs"`, `"esm"`, or `"json"`.
    #[napi(getter)]
    pub fn module_type(&self) -> Result<String> {
        Ok(self
            .data
            .lock()
            .map_err(lock_err)?
            .module_type
            .as_str()
            .to_string())
    }
    #[napi(setter)]
    pub fn set_module_type(&self, value: String) -> Result<()> {
        let mt = match value.as_str() {
            "cjs" => ModuleType::Cjs,
            "esm" => ModuleType::Esm,
            "json" => ModuleType::Json,
            other => {
                return Err(Error::new(
                    Status::InvalidArg,
                    format!("unknown moduleType: {other} (expected cjs|esm|json)"),
                ));
            }
        };
        self.data.lock().map_err(lock_err)?.module_type = mt;
        Ok(())
    }

    /// Resolved file extension including the dot (e.g. `".ts"`).
    #[napi(getter)]
    pub fn file_ext(&self) -> Result<String> {
        Ok(self
            .data
            .lock()
            .map_err(lock_err)?
            .file_ext
            .as_ext_str()
            .to_string())
    }
    #[napi(setter)]
    pub fn set_file_ext(&self, value: String) -> Result<()> {
        let ext = ValidExts::from_path_ext(&value).ok_or_else(|| {
            Error::new(
                Status::InvalidArg,
                format!("unknown file extension: {value}"),
            )
        })?;
        self.data.lock().map_err(lock_err)?.file_ext = ext;
        Ok(())
    }

    /// Whether the file contains JSX syntax.
    #[napi(getter)]
    pub fn is_jsx(&self) -> Result<bool> {
        Ok(self.data.lock().map_err(lock_err)?.is_jsx)
    }
    #[napi(setter)]
    pub fn set_is_jsx(&self, value: bool) -> Result<()> {
        self.data.lock().map_err(lock_err)?.is_jsx = value;
        Ok(())
    }

    /// Whether this is the entry file.
    #[napi(getter)]
    pub fn is_entry(&self) -> Result<bool> {
        Ok(self.data.lock().map_err(lock_err)?.is_entry)
    }
    #[napi(setter)]
    pub fn set_is_entry(&self, value: bool) -> Result<()> {
        self.data.lock().map_err(lock_err)?.is_entry = value;
        Ok(())
    }

    /// Parse this entry's `content` into a [`SourceFile`].
    ///
    /// Reuses the oxc parser backing [`super::parse_source_file`]. Use the
    /// returned `SourceFile`'s `.program` (AST JSON) and
    /// [`super::visit`] to inspect the file's AST — the
    /// "AST for deps_files.content" hook from the project notes.
    #[napi]
    pub fn parse(&self) -> Result<SourceFile> {
        let g = self.data.lock().map_err(lock_err)?;
        super::parse::parse_source_file_inner(&g.content, &g.file)
    }
}

// ---------------------------------------------------------------------------
// DepsFiles — the array-like container passed to the dependency hook.
// ---------------------------------------------------------------------------

/// The dependency tree passed to a `dependency`-stage JS plugin.
///
/// Provides array-like access (`length`, indexed get/set, `push`,
/// `insertAt`, `removeAt`) plus npm, node-builtin, and warning management.
#[napi]
pub struct DepsFiles {
    pub(crate) data: Arc<Mutex<DepsFilesData>>,
}

#[napi]
impl DepsFiles {
    /// Number of dependency files.
    #[napi(getter)]
    pub fn length(&self) -> Result<u32> {
        Ok(self.data.lock().map_err(lock_err)?.entries.len() as u32)
    }

    /// Get the entry at `index` (0-based). Returns `null` if out of range.
    #[napi]
    pub fn get(&self, index: u32) -> Result<Option<DepsFileEntry>> {
        let g = self.data.lock().map_err(lock_err)?;
        Ok(g.entries
            .get(index as usize)
            .map(|arc| DepsFileEntry { data: arc.clone() }))
    }

    /// Replace the entry at `index` with `entry`.
    #[napi]
    pub fn set(&self, index: u32, entry: &DepsFileEntry) -> Result<()> {
        let mut g = self.data.lock().map_err(lock_err)?;
        let i = index as usize;
        if i >= g.entries.len() {
            return Err(Error::new(
                Status::InvalidArg,
                format!("set: index {index} out of range (len {})", g.entries.len()),
            ));
        }
        g.entries[i] = entry.data.clone();
        Ok(())
    }

    /// Append a new entry to the end of the list.
    #[napi]
    pub fn push(&self, entry: &DepsFileEntry) -> Result<()> {
        self.data
            .lock()
            .map_err(lock_err)?
            .entries
            .push(entry.data.clone());
        Ok(())
    }

    /// Insert `entry` at `index`, shifting later entries right.
    #[napi]
    pub fn insert_at(&self, index: u32, entry: &DepsFileEntry) -> Result<()> {
        let mut g = self.data.lock().map_err(lock_err)?;
        let i = index as usize;
        if i > g.entries.len() {
            return Err(Error::new(
                Status::InvalidArg,
                format!(
                    "insertAt: index {index} out of range (len {})",
                    g.entries.len()
                ),
            ));
        }
        g.entries.insert(i, entry.data.clone());
        Ok(())
    }

    /// Remove and return the entry at `index`. Returns `null` if out of range.
    #[napi]
    pub fn remove_at(&self, index: u32) -> Result<Option<DepsFileEntry>> {
        let mut g = self.data.lock().map_err(lock_err)?;
        let i = index as usize;
        if i >= g.entries.len() {
            return Ok(None);
        }
        let arc = g.entries.remove(i);
        Ok(Some(DepsFileEntry { data: arc }))
    }

    // --- npm dependencies ----------------------------------------------

    /// The list of npm package specifiers referenced by the tree.
    #[napi(getter)]
    pub fn npm(&self) -> Result<Vec<String>> {
        Ok(self.data.lock().map_err(lock_err)?.npm.clone())
    }
    #[napi(setter)]
    pub fn set_npm(&self, value: Vec<String>) -> Result<()> {
        self.data.lock().map_err(lock_err)?.npm = value;
        Ok(())
    }
    /// Add an npm package specifier if not already present.
    #[napi]
    pub fn add_npm(&self, spec: String) -> Result<()> {
        let mut g = self.data.lock().map_err(lock_err)?;
        if !g.npm.contains(&spec) {
            g.npm.push(spec);
        }
        Ok(())
    }
    /// Remove an npm package specifier. No-op if absent.
    #[napi]
    pub fn remove_npm(&self, spec: String) -> Result<()> {
        let mut g = self.data.lock().map_err(lock_err)?;
        g.npm.retain(|n| n != &spec);
        Ok(())
    }

    // --- node builtins -------------------------------------------------

    /// The list of node built-in modules referenced by the tree.
    #[napi(getter)]
    pub fn nodes(&self) -> Result<Vec<String>> {
        Ok(self.data.lock().map_err(lock_err)?.nodes.clone())
    }
    #[napi(setter)]
    pub fn set_nodes(&self, value: Vec<String>) -> Result<()> {
        self.data.lock().map_err(lock_err)?.nodes = value;
        Ok(())
    }
    /// Register a node built-in module (e.g. `"fs"`, `"path"`).
    #[napi]
    pub fn add_node(&self, name: String) -> Result<()> {
        let mut g = self.data.lock().map_err(lock_err)?;
        if !g.nodes.contains(&name) {
            g.nodes.push(name);
        }
        Ok(())
    }
    /// Remove a node built-in. No-op if absent.
    #[napi]
    pub fn remove_node(&self, name: String) -> Result<()> {
        let mut g = self.data.lock().map_err(lock_err)?;
        g.nodes.retain(|n| n != &name);
        Ok(())
    }

    // --- warnings ------------------------------------------------------

    /// Warnings collected for the tree (mirrors `tree.warns`).
    #[napi(getter)]
    pub fn warns(&self) -> Result<Vec<String>> {
        Ok(self.data.lock().map_err(lock_err)?.warns.clone())
    }
    /// Push a warning that susee surfaces (and fails the build if `warning`
    /// is enabled in the config).
    #[napi]
    pub fn add_warn(&self, message: String) -> Result<()> {
        self.data.lock().map_err(lock_err)?.warns.push(message);
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// SuseePluginContext — the context object passed to every JS hook.
// ---------------------------------------------------------------------------

/// Context passed to every JS plugin hook.
///
/// Replaces the positional `func(depsFiles, compilerOptions)` /
/// `func(code, file?)` signatures with a single extensible object, mirroring
/// the Rust [`crate::plugins::context::PluginContext`].
#[napi]
pub struct SuseePluginContext {
    pub(crate) entry: String,
    pub(crate) format: Option<String>,
    pub(crate) compiler_options: SuseeCompilerOptions,
    pub(crate) warns: Arc<Mutex<Vec<String>>>,
}

#[napi]
impl SuseePluginContext {
    /// The entry file path for the current build point.
    #[napi(getter)]
    pub fn entry(&self) -> String {
        self.entry.clone()
    }

    /// The output format being emitted (`"esm"` / `"commonjs"`), or `null`
    /// for hooks that run before format selection (e.g. `on_dependencies`).
    #[napi(getter)]
    pub fn format(&self) -> Option<String> {
        self.format.clone()
    }

    /// The susee-native compiler options in effect (replaces
    /// `ts.CompilerOptions`).
    #[napi(getter)]
    pub fn compiler_options(&self) -> SuseeCompilerOptions {
        SuseeCompilerOptions {
            out_dir: self.compiler_options.out_dir.clone(),
            module: self.compiler_options.module.clone(),
            target: self.compiler_options.target.clone(),
            jsx: self.compiler_options.jsx.clone(),
            jsx_import_source: self.compiler_options.jsx_import_source.clone(),
            lib: self.compiler_options.lib.clone(),
            allow_js: self.compiler_options.allow_js,
            declaration: self.compiler_options.declaration,
            source_map: self.compiler_options.source_map,
        }
    }

    /// Push a warning that susee surfaces.
    #[napi]
    pub fn warn(&self, message: String) -> Result<()> {
        self.warns.lock().map_err(lock_err)?.push(message);
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/// Convert a `Mutex` poison error into a napi `GenericFailure`.
fn lock_err<T>(_e: T) -> Error {
    Error::new(
        Status::GenericFailure,
        "internal: deps-files mutex poisoned",
    )
}

/// Build a [`DepsFiles`] (with shared backing data) from a Rust
/// `Vec<DepsFile>` plus the tree's npm/nodes/warns lists.
///
/// Used by the [`crate::plugins::js_plugin::JsPlugin`] adapter to construct
/// the JS-facing container before calling the hook.
pub fn deps_files_from_rust(
    dep_files: Vec<DepsFile>,
    npm: Vec<String>,
    nodes: Vec<String>,
    warns: Vec<String>,
) -> DepsFiles {
    let entries = dep_files
        .into_iter()
        .map(|d| Arc::new(Mutex::new(DepsFileEntryData::from(d))))
        .collect::<Vec<_>>();
    DepsFiles {
        data: Arc::new(Mutex::new(DepsFilesData {
            entries,
            npm,
            nodes,
            warns,
        })),
    }
}

/// Read a [`DepsFiles`] back into a Rust `Vec<DepsFile>`, applying any JS
/// mutations (content edits, reordering, insertions, removals).
///
/// Used by the adapter after the hook returns.
pub fn deps_files_to_rust(df: &DepsFiles) -> Result<Vec<DepsFile>> {
    let g = df.data.lock().map_err(lock_err)?;
    let mut out = Vec::with_capacity(g.entries.len());
    for arc in &g.entries {
        let eg = arc.lock().map_err(lock_err)?;
        out.push(DepsFile::from(eg.clone()));
    }
    Ok(out)
}

/// Read the npm list back from a [`DepsFiles`].
pub fn deps_files_npm(df: &DepsFiles) -> Result<Vec<String>> {
    Ok(df.data.lock().map_err(lock_err)?.npm.clone())
}

/// Read the node-builtins list back from a [`DepsFiles`].
pub fn deps_files_nodes(df: &DepsFiles) -> Result<Vec<String>> {
    Ok(df.data.lock().map_err(lock_err)?.nodes.clone())
}

/// Read the warnings list back from a [`DepsFiles`].
pub fn deps_files_warns(df: &DepsFiles) -> Result<Vec<String>> {
    Ok(df.data.lock().map_err(lock_err)?.warns.clone())
}
