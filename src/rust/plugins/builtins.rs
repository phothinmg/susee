//! Built-in plugins.
//!
//! These ship with susee so users have working examples of each hook stage
//! and so the CLI has a minifier available out of the box (the TS port
//! expects users to bring their own minifier via a post-process plugin).
//!
//! ## Contents
//! - [`MinifyPlugin`] — a `post-process` plugin that strips comments and
//!   collapses runs of whitespace. A minimal stand-in for a production
//!   minifier (e.g. `terser`); the intent is to show the hook contract, not
//!   to match a real minifier's output.
//! - [`TreePlugin`] — a `dependency` plugin skeleton demonstrating the
//!   "tree(ast) plugin" hook from the project notes. It logs the dep files
//!   the tree contains and leaves them unchanged — a starting point for
//!   plugins that manage npm modules / node builtins.

use super::context::{DependencyPayload, PluginContext, PostProcessPayload};
use super::plugin::{Plugin, PluginError};
use super::types::PluginType;

// ---------------------------------------------------------------------------
// MinifyPlugin
// ---------------------------------------------------------------------------

/// A minimal post-process minifier.
///
/// Strips:
/// - Line comments (`// ...`) and block comments (`/* ... */`).
/// - Leading/trailing whitespace on each line.
/// - Blank lines.
///
/// It does **not** rename identifiers or dead-code-eliminate — that requires
/// a full AST pass and is out of scope for the built-in. Use it as a
/// starting point or replace it with a real minifier plugin.
///
/// # Example
/// ```no_run
/// use susee::plugins::{MinifyPlugin, Plugin};
/// let p = MinifyPlugin::new();
/// ```
pub struct MinifyPlugin {
    name: String,
}

impl Default for MinifyPlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl MinifyPlugin {
    pub fn new() -> Self {
        Self {
            name: "minify".to_string(),
        }
    }

    /// Give the plugin a custom name (e.g. when running multiple minifier
    /// instances with different settings).
    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.name = name.into();
        self
    }
}

impl Plugin for MinifyPlugin {
    fn name(&self) -> &str {
        &self.name
    }

    fn stages(&self) -> &[PluginType] {
        &[PluginType::PostProcess]
    }

    fn on_post_process(
        &self,
        _ctx: &PluginContext<'_>,
        payload: PostProcessPayload,
    ) -> Result<PostProcessPayload, PluginError> {
        Ok(PostProcessPayload {
            code: minify(&payload.code),
        })
    }
}

/// Strip comments and collapse whitespace. Exported so other plugins can
/// reuse the pass.
pub fn minify(code: &str) -> String {
    let without_block_comments = strip_block_comments(code);
    let mut out = String::with_capacity(without_block_comments.len());
    for line in without_block_comments.lines() {
        // Strip line comments, but preserve `http://` and `https://` inside
        // strings naively (a real minifier would parse; this is good enough
        // for the built-in).
        let stripped = strip_line_comment(line).trim();
        if stripped.is_empty() {
            continue;
        }
        // Collapse internal runs of whitespace to a single space.
        let collapsed: String = stripped.split_whitespace().collect::<Vec<_>>().join(" ");
        out.push_str(&collapsed);
        out.push('\n');
    }
    out.trim_end().to_string()
}

/// Remove `/* ... */` blocks (including multi-line ones).
fn strip_block_comments(code: &str) -> String {
    let mut out = String::with_capacity(code.len());
    let mut chars = code.char_indices().peekable();
    let bytes = code.as_bytes();
    while let Some((i, c)) = chars.next() {
        if c == '/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            // Find the closing `*/`.
            let rest = &code[i + 2..];
            if let Some(end) = rest.find("*/") {
                // Advance past `*/`.
                let skip = end + 2; // `*/`
                for _ in 0..skip {
                    chars.next();
                }
                continue;
            } else {
                // Unterminated block comment — keep the rest as-is.
                break;
            }
        }
        out.push(c);
    }
    out
}

/// Strip a `// ...` line comment, naively preserving `://` in strings.
fn strip_line_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut in_string = false;
    let mut quote = b'"';
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if in_string {
            if c == quote {
                in_string = false;
            } else if c == b'\\' {
                // Skip the escaped char.
                i += 1;
            }
        } else if c == b'"' || c == b'\'' || c == b'`' {
            in_string = true;
            quote = c;
        } else if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            return &line[..i];
        }
        i += 1;
    }
    line
}

// ---------------------------------------------------------------------------
// TreePlugin
// ---------------------------------------------------------------------------

/// A dependency-stage plugin skeleton — the "tree(ast) plugin" hook from
/// the project notes.
///
/// By default it only logs the dep files it sees (when `SUSEE_PROFILE` is
/// on) and leaves the tree unchanged. Subclass by replacing `on_dependencies`
/// with logic that manages npm modules / node builtins / AST-level edits.
pub struct TreePlugin {
    name: String,
    /// When `true`, logs each dep file path during the dependency hook.
    pub verbose: bool,
}

impl Default for TreePlugin {
    fn default() -> Self {
        Self::new()
    }
}

impl TreePlugin {
    pub fn new() -> Self {
        Self {
            name: "tree".to_string(),
            verbose: false,
        }
    }

    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.name = name.into();
        self
    }

    pub fn verbose(mut self, verbose: bool) -> Self {
        self.verbose = verbose;
        self
    }
}

impl Plugin for TreePlugin {
    fn name(&self) -> &str {
        &self.name
    }

    fn stages(&self) -> &[PluginType] {
        &[PluginType::Dependency]
    }

    fn on_dependencies(
        &self,
        ctx: &PluginContext<'_>,
        payload: DependencyPayload,
    ) -> Result<DependencyPayload, PluginError> {
        if self.verbose {
            eprintln!(
                "[tree-plugin:{}]: {} dep file(s)",
                ctx.entry,
                payload.deps_files.len()
            );
            for f in &payload.deps_files {
                eprintln!("  - {} ({} bytes)", f.file, f.bytes);
            }
        }
        Ok(payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minify_strips_line_comments() {
        let out = minify("const x = 1; // hello\nconst y = 2;");
        assert!(!out.contains("hello"));
        assert!(out.contains("const x = 1;"));
        assert!(out.contains("const y = 2;"));
    }

    #[test]
    fn minify_strips_block_comments() {
        let out = minify("/* before */ const x = 1; /* after */");
        assert!(!out.contains("before"));
        assert!(!out.contains("after"));
        assert!(out.contains("const x = 1;"));
    }

    #[test]
    fn minify_preserves_urls_in_strings() {
        let out = minify(r#"const url = "https://example.com"; // tail"#);
        assert!(out.contains("https://example.com"));
        assert!(!out.contains("tail"));
    }

    #[test]
    fn minify_collapses_whitespace() {
        let out = minify("const   x   =   1;");
        assert_eq!(out, "const x = 1;");
    }

    #[test]
    fn minify_drops_blank_lines() {
        let out = minify("a\n\n\nb");
        assert_eq!(out, "a\nb");
    }

    #[test]
    fn minify_plugin_runs_via_dispatcher() {
        use super::super::dispatcher::dispatch_post_process;
        let p: Box<dyn Plugin> = Box::new(MinifyPlugin::new());
        let ctx = PluginContext::for_bundler("e.ts");
        let payload = PostProcessPayload {
            code: "const x = 1; // hi".to_string(),
        };
        let out = dispatch_post_process(&[p], &ctx, payload, "test").unwrap();
        assert!(!out.code.contains("hi"));
    }

    #[test]
    fn tree_plugin_passes_through_unchanged() {
        use super::super::dispatcher::dispatch_dependencies;
        use crate::dependencies::types::{DepsFile, ModuleType, ValidExts};
        let p: Box<dyn Plugin> = Box::new(TreePlugin::new());
        let ctx = PluginContext::for_bundler("e.ts");
        let payload = DependencyPayload {
            deps_files: vec![DepsFile {
                file: "a.ts".into(),
                content: "x".into(),
                bytes: 1,
                module_type: ModuleType::Esm,
                file_ext: ValidExts::Ts,
                is_jsx: false,
                is_entry: false,
            }],
        };
        let out = dispatch_dependencies(&[p], &ctx, payload, "test").unwrap();
        assert_eq!(out.deps_files.len(), 1);
        assert_eq!(out.deps_files[0].content, "x");
    }

    #[test]
    fn plugin_names_default_and_custom() {
        assert_eq!(MinifyPlugin::new().name(), "minify");
        assert_eq!(MinifyPlugin::new().with_name("min").name(), "min");
        assert_eq!(TreePlugin::new().name(), "tree");
    }
}
