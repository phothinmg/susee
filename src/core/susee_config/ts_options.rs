// #![allow(dead_code)]
use std::path::{Path, PathBuf};

use super::config_types::OutputFormat;
use serde::{Deserialize, Serialize};

/// Module kind, mirroring `ts.ModuleKind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModuleKind {
    Commonjs,
    Es2020,
}

impl ModuleKind {
    /// The module kind susee uses for a given output format.
    pub fn for_format(format: OutputFormat) -> Self {
        match format {
            OutputFormat::Commonjs => Self::Commonjs,
            OutputFormat::Esm => Self::Es2020,
        }
    }
}

/// A minimal subset of `ts.CompilerOptions` used by susee.
///
/// Unknown fields from `tsconfig.json` are preserved in `raw` so downstream
/// passes (e.g. JSX handling) can inspect them, but the bundler/compiler
/// only reads the typed fields.
#[derive(Debug, Clone, Default)]
pub struct CompilerOptions {
    /// Output directory. Defaults to `"dist"`.
    pub out_dir: String,
    pub module: Option<ModuleKind>,
    /// Script target (e.g. `esnext`). Defaults to `"latest"`.
    pub target: String,
    /// JSX emit mode (`react-jsx`, `preserve`, ...). Optional.
    pub jsx: Option<String>,
    /// JSX runtime import source (`jsxImportSource`).
    pub jsx_import_source: Option<String>,
    /// Libs (`dom`, `dom.iterable`, `esnext`, ...).
    pub lib: Vec<String>,
    /// Whether `.js` files are allowed as inputs. Defaults to `true` for susee.
    pub allow_js: bool,
    /// Whether to emit declarations (`.d.ts`). Defaults to `true`.
    pub declaration: bool,
    /// Whether to emit source maps. Defaults to `false`.
    pub source_map: bool,
    /// Raw, unparsed options from `tsconfig.json` (if any).
    pub raw: serde_json::Value,
}

impl CompilerOptions {
    /// Susee's default options, mirroring the `else` branch of `commonjs`/`esm`
    /// in `tsoptions.ts`.
    pub fn defaults() -> Self {
        Self {
            out_dir: "dist".to_string(),
            module: None,
            target: "latest".to_string(),
            jsx: None,
            jsx_import_source: None,
            lib: Vec::new(),
            allow_js: true,
            declaration: true,
            source_map: false,
            raw: serde_json::Value::Null,
        }
    }
}

/// Result of loading and normalizing compiler options, mirroring the shape
/// returned by `getCompilerOptions` in `tsoptions.ts`.
pub struct CompilerOptionsBuilder {
    base: CompilerOptions,
}

impl CompilerOptionsBuilder {
    /// Build the options for a specific output format and output dir.
    pub fn build(&self, format: OutputFormat, out_dir: Option<&str>) -> CompilerOptions {
        let mut opts = self.base.clone();
        opts.out_dir = out_dir.unwrap_or("dist").to_string();
        opts.module = Some(ModuleKind::for_format(format));
        opts
    }

    /// The default options (no tsconfig merge).
    #[allow(dead_code)]
    pub fn default_options(&self) -> CompilerOptions {
        self.base.clone()
    }
}

/// Locate a `tsconfig.json` file.
///
/// If `custom_config_path` is given and exists, it is used. Otherwise we
/// search the current directory for `tsconfig.json`. Mirrors
/// `getTsConfigPath`.
pub fn get_ts_config_path(custom_config_path: Option<&str>) -> Option<PathBuf> {
    if let Some(custom) = custom_config_path {
        let p = Path::new(custom);
        if p.exists() {
            return Some(p.to_path_buf());
        }
        eprintln!("> Given custom tsconfig file {custom} does not exist; falling back to defaults");
        None
    } else {
        let cwd = std::env::current_dir().ok()?;
        let default = cwd.join("tsconfig.json");
        if default.exists() {
            Some(default)
        } else {
            None
        }
    }
}

/// Strip JSONC line (`// ...`) and block (`/* ... */`) comments so a
/// `tsconfig.json` (which TypeScript allows to contain comments) can be
/// parsed by the strict `serde_json` parser.
///
/// This is a deliberately small scanner — it tracks whether the cursor is
/// inside a string literal so that `//` or `/*` inside a string is not
/// mistaken for a comment. It does not handle trailing commas (serde_json
/// already rejects those, and tsconfig.json typically doesn't use them).
pub(crate) fn strip_jsonc_comments(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    let mut in_string = false;

    while i < bytes.len() {
        if in_string {
            // Inside a string — copy until the closing unescaped `"`.
            let c = bytes[i];
            out.push(c as char);
            if c == b'\\' && i + 1 < bytes.len() {
                // Escaped char — copy the next byte verbatim.
                out.push(bytes[i + 1] as char);
                i += 2;
                continue;
            }
            if c == b'"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        let c = bytes[i];

        // String start.
        if c == b'"' {
            in_string = true;
            out.push('"');
            i += 1;
            continue;
        }

        // Line comment `// ... \n`.
        if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            // Skip to end of line.
            i += 2;
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }

        // Block comment `/* ... */`.
        if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            i += 2; // skip closing `*/`
            continue;
        }

        out.push(c as char);
        i += 1;
    }

    out
}

/// Read the `compilerOptions` block from a `tsconfig.json` file.
///
/// This is a deliberately small reader — it pulls only the fields susee
/// understands and stores the rest in `raw`. Paths inside `tsconfig.json`
/// (e.g. `outDir`) are resolved relative to the tsconfig directory, matching
/// the TS `parseJsonConfigFileContent` behavior for the fields susee uses.
///
/// `tsconfig.json` may contain JSONC-style comments (`//` and `/* */`), which
/// strict `serde_json` rejects. We strip those via [`strip_jsonc_comments`]
/// before parsing — mirroring how `ts.readConfigFile` tolerates comments.
fn read_tsconfig(path: &Path) -> Option<CompilerOptions> {
    let text = std::fs::read_to_string(path).ok()?;
    let clean = strip_jsonc_comments(&text);
    let root: serde_json::Value = serde_json::from_str(&clean).ok()?;
    let co = root.get("compilerOptions")?;
    let mut opts = CompilerOptions::defaults();
    opts.raw = co.clone();

    if let Some(out_dir) = co.get("outDir").and_then(|v| v.as_str()) {
        // Resolve relative to the tsconfig directory.
        let base = path.parent().unwrap_or_else(|| Path::new(""));
        opts.out_dir = base.join(out_dir).to_string_lossy().to_string();
    }
    if let Some(target) = co.get("target").and_then(|v| v.as_str()) {
        opts.target = target.to_string();
    }
    if let Some(jsx) = co.get("jsx").and_then(|v| v.as_str()) {
        opts.jsx = Some(jsx.to_string());
    }
    if let Some(src) = co.get("jsxImportSource").and_then(|v| v.as_str()) {
        opts.jsx_import_source = Some(src.to_string());
    }
    if let Some(libs) = co.get("lib").and_then(|v| v.as_array()) {
        opts.lib = libs
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
    }
    if let Some(allow) = co.get("allowJs").and_then(|v| v.as_bool()) {
        opts.allow_js = allow;
    }
    if let Some(decl) = co.get("declaration").and_then(|v| v.as_bool()) {
        opts.declaration = decl;
    }
    if let Some(sm) = co.get("sourceMap").and_then(|v| v.as_bool()) {
        opts.source_map = sm;
    }
    // `module` is intentionally left as `None` here — susee overrides it
    // per-format in `CompilerOptionsBuilder::build`, mirroring the TS
    // destructuring of `module` out of the tsconfig options.
    Some(opts)
}

/// Get a compiler-options builder for the given tsconfig path.
///
/// Mirrors `getCompilerOptions(customConfigPath)` from `tsoptions.ts`.
/// Use the returned builder to produce per-format [`CompilerOptions`].
pub fn get_compiler_options(custom_config_path: Option<&str>) -> CompilerOptionsBuilder {
    let base = get_ts_config_path(custom_config_path)
        .and_then(|p| read_tsconfig(&p))
        .unwrap_or_else(CompilerOptions::defaults);
    CompilerOptionsBuilder { base }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_have_sensible_values() {
        let d = CompilerOptions::defaults();
        assert_eq!(d.out_dir, "dist");
        assert_eq!(d.target, "latest");
        assert!(d.allow_js);
        assert!(d.declaration);
    }

    #[test]
    fn build_sets_module_kind_per_format() {
        let b = get_compiler_options(None);
        let cjs = b.build(OutputFormat::Commonjs, Some("out"));
        assert_eq!(cjs.module, Some(ModuleKind::Commonjs));
        assert_eq!(cjs.out_dir, "out");
        let esm = b.build(OutputFormat::Esm, None);
        assert_eq!(esm.module, Some(ModuleKind::Es2020));
        assert_eq!(esm.out_dir, "dist");
    }

    #[test]
    fn read_tsconfig_picks_up_fields() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("tsconfig.json");
        std::fs::write(
            &path,
            r#"{
                "compilerOptions": {
                    "outDir": "build",
                    "target": "es2022",
                    "jsx": "react-jsx",
                    "jsxImportSource": "react",
                    "lib": ["dom", "esnext"],
                    "sourceMap": true
                }
            }"#,
        )
        .unwrap();
        let opts = read_tsconfig(&path).unwrap();
        assert!(opts.out_dir.ends_with("build"));
        assert_eq!(opts.target, "es2022");
        assert_eq!(opts.jsx.as_deref(), Some("react-jsx"));
        assert_eq!(opts.jsx_import_source.as_deref(), Some("react"));
        assert_eq!(opts.lib, vec!["dom", "esnext"]);
        assert!(opts.source_map);
    }

    #[test]
    fn read_tsconfig_handles_jsonc_comments() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("tsconfig.json");
        std::fs::write(
            &path,
            r#"{
                // This is a line comment
                "compilerOptions": {
                    "outDir": "build",
                    /* block comment */ "sourceMap": true,
                    "declaration": true, // trailing comment
                    //"target": "es2022",
                    "target": "esnext"
                }
            }"#,
        )
        .unwrap();
        let opts = read_tsconfig(&path).unwrap();
        assert!(opts.source_map, "source_map should be true with comments");
        assert!(opts.declaration, "declaration should be true with comments");
        assert_eq!(
            opts.target, "esnext",
            "commented-out target should be ignored"
        );
        assert!(opts.out_dir.ends_with("build"));
    }

    #[test]
    fn strip_jsonc_preserves_strings_with_slashes() {
        let input = r#"{"url": "https://example.com/path", "x": 1 // comment
}"#;
        let clean = strip_jsonc_comments(input);
        let v: serde_json::Value = serde_json::from_str(&clean).unwrap();
        assert_eq!(v["url"], "https://example.com/path");
        assert_eq!(v["x"], 1);
    }
}
