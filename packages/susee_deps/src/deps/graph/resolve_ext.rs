//! Resolve a file path with an extension or as a directory module (index file).

use std::fs;
use std::path::{Path, PathBuf};

/// File extensions allowed for JS/TS/JSON modules.
const ALLOWED_EXTENSIONS: &[&str] = &["js", "cjs", "mjs", "ts", "mts", "cts", "jsx", "tsx", "json"];

/// Result of resolving a module path.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ResolvedPath {
    /// The resolved absolute file path.
    pub result: PathBuf,
    /// The resolved extension (without leading dot).
    pub ext: String,
    /// Whether the path was resolved as a directory (index file).
    pub is_dir_path: bool,
}

fn is_dir(path: &Path) -> bool {
    fs::metadata(path).map(|m| m.is_dir()).unwrap_or(false)
}

fn file_name(input: &str) -> String {
    Path::new(input)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

fn extension_name(input: &str) -> String {
    Path::new(input)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

/// Resolve a file path with an extension or as a directory module (index file).
///
/// Mirrors the behaviour of `resolveExtension` from the TS version:
/// 1. If the path is a directory, look for an `index.*` file with an allowed extension.
/// 2. Otherwise, search the containing directory for a file whose stem matches
///    and whose extension is allowed, then reconcile with any extension already
///    present in the input.
///
/// Returns `Err(message)` if resolution fails (instead of `process.exit(1)`).
pub fn resolve_extension(file_path: &Path) -> Result<ResolvedPath, String> {
    // 1. Directory: look for index.<ext>
    if is_dir(file_path) {
        if let Some(found) = find_index_file(file_path) {
            return Ok(ResolvedPath {
                result: file_path.join(&found),
                ext: extension_name(&found),
                is_dir_path: true,
            });
        }
        return Err(format!(
            "{} is a directory and no index file with JS/TS extension found.",
            file_path.display()
        ));
    }

    // 2. Not a directory: try to resolve extension
    let dir_name = file_path.parent().unwrap_or_else(|| Path::new("."));
    // A parent of `""` (from a single-component relative path like
    // `package.json`) cannot be opened with `read_dir`; treat it as the
    // current directory instead.
    let dir_name = if dir_name.as_os_str().is_empty() {
        Path::new(".")
    } else {
        dir_name
    };
    let base_name = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("");
    let stem = file_name(base_name);
    let input_ext = extension_name(base_name);

    let entries = match fs::read_dir(dir_name) {
        Ok(rd) => rd,
        Err(_) => {
            // Fall back to directory check (e.g. `./lib` with no extension)
            if is_dir(file_path)
                && let Some(found) = find_index_file(file_path)
            {
                return Ok(ResolvedPath {
                    result: file_path.join(&found),
                    ext: extension_name(&found),
                    is_dir_path: true,
                });
            }
            return Err(format!(
                "When checking {}, it's not a file or file with unsupported extension",
                file_path.display()
            ));
        }
    };

    let mut matched_ext: Option<String> = None;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let n = file_name(&name_str);
        let e = extension_name(&name_str);
        if n == stem && ALLOWED_EXTENSIONS.contains(&e.as_str()) {
            matched_ext = Some(e);
            break;
        }
    }

    let Some(match_ext) = matched_ext else {
        // Maybe it's a directory import (e.g. ./lib)
        if is_dir(file_path)
            && let Some(found) = find_index_file(file_path)
        {
            return Ok(ResolvedPath {
                result: file_path.join(&found),
                ext: extension_name(&found),
                is_dir_path: true,
            });
        }
        return Err(format!(
            "When checking {}, it's not a file or file with unsupported extension",
            file_path.display()
        ));
    };

    let (result, ext) = if input_ext.is_empty() {
        // No extension in input → append matched extension
        (file_path.with_extension(&match_ext), match_ext)
    } else if input_ext == match_ext {
        (file_path.to_path_buf(), match_ext)
    } else {
        // Replace the input extension with the matched one
        (file_path.with_extension(&match_ext), match_ext)
    };

    Ok(ResolvedPath {
        result,
        ext,
        is_dir_path: false,
    })
}

/// Find an `index.<allowed-ext>` file in a directory.
fn find_index_file(dir: &Path) -> Option<String> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if file_name(&name_str) == "index"
            && ALLOWED_EXTENSIONS.contains(&extension_name(&name_str).as_str())
        {
            return Some(name_str.into_owned());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn resolves_file_with_extension() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("foo.ts");
        fs::write(&file, "export const x = 1;").unwrap();

        let resolved = resolve_extension(&file).unwrap();
        assert_eq!(resolved.result, file);
        assert_eq!(resolved.ext, "ts");
        assert!(!resolved.is_dir_path);
    }

    #[test]
    fn resolves_missing_extension_from_directory() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("foo.ts");
        fs::write(&file, "export const x = 1;").unwrap();

        // request without extension
        let req = dir.path().join("foo");
        let resolved = resolve_extension(&req).unwrap();
        assert_eq!(resolved.result, file);
        assert_eq!(resolved.ext, "ts");
    }

    #[test]
    fn resolves_directory_with_index() {
        let dir = tempdir().unwrap();
        let mod_dir = dir.path().join("mod");
        fs::create_dir(&mod_dir).unwrap();
        let index = mod_dir.join("index.ts");
        fs::write(&index, "export const x = 1;").unwrap();

        let resolved = resolve_extension(&mod_dir).unwrap();
        assert_eq!(resolved.result, index);
        assert!(resolved.is_dir_path);
        assert_eq!(resolved.ext, "ts");
    }

    #[test]
    fn directory_without_index_errors() {
        let dir = tempdir().unwrap();
        let mod_dir = dir.path().join("mod");
        fs::create_dir(&mod_dir).unwrap();

        let err = resolve_extension(&mod_dir).unwrap_err();
        assert!(err.contains("no index file"));
    }

    #[test]
    fn nonexistent_file_errors() {
        let dir = tempdir().unwrap();
        let req = dir.path().join("nope");
        assert!(resolve_extension(&req).is_err());
    }

    #[test]
    fn replaces_unsupported_extension() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("foo.ts");
        fs::write(&file, "export const x = 1;").unwrap();

        // request with a different (unsupported-ish) extension present on disk as .ts
        let req = dir.path().join("foo.js");
        let resolved = resolve_extension(&req).unwrap();
        assert_eq!(resolved.ext, "ts");
        assert_eq!(resolved.result, file);
    }
}
