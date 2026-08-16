//! Unit tests for `graph::resolve_ext::resolve_extension`.

use std::fs;
use std::path::{Path, PathBuf};
use susee::graph::resolve_ext::resolve_extension;
use tempfile::tempdir;

fn write_file(dir: &Path, rel: &str, content: &str) -> PathBuf {
    let full = dir.join(rel);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(&full, content).unwrap();
    full
}

#[test]
fn resolves_file_with_existing_extension() {
    let dir = tempdir().unwrap();
    write_file(dir.path(), "entry.ts", "export const x = 1;");
    let resolved = resolve_extension(&dir.path().join("entry.ts")).unwrap();
    assert!(resolved.result.exists());
    assert_eq!(resolved.ext, "ts");
    assert!(!resolved.is_dir_path);
}

#[test]
fn resolves_file_without_extension_by_appending() {
    let dir = tempdir().unwrap();
    write_file(dir.path(), "entry.ts", "export const x = 1;");
    let resolved = resolve_extension(&dir.path().join("entry")).unwrap();
    assert_eq!(resolved.result, dir.path().join("entry.ts"));
    assert_eq!(resolved.ext, "ts");
}

#[test]
fn resolves_directory_with_index_file() {
    let dir = tempdir().unwrap();
    write_file(dir.path(), "lib/index.ts", "export const lib = 1;");
    let resolved = resolve_extension(&dir.path().join("lib")).unwrap();
    assert_eq!(resolved.result, dir.path().join("lib/index.ts"));
    assert_eq!(resolved.ext, "ts");
    assert!(resolved.is_dir_path);
}

#[test]
fn resolves_index_with_jsx_extension() {
    let dir = tempdir().unwrap();
    write_file(dir.path(), "components/index.tsx", "export const C = 1;");
    let resolved = resolve_extension(&dir.path().join("components")).unwrap();
    assert_eq!(resolved.result, dir.path().join("components/index.tsx"));
    assert_eq!(resolved.ext, "tsx");
}

#[test]
fn returns_err_for_nonexistent_file() {
    let dir = tempdir().unwrap();
    let result = resolve_extension(&dir.path().join("nonexistent.ts"));
    assert!(result.is_err());
}

#[test]
fn returns_err_for_directory_without_index() {
    let dir = tempdir().unwrap();
    fs::create_dir(dir.path().join("emptydir")).unwrap();
    let result = resolve_extension(&dir.path().join("emptydir"));
    assert!(result.is_err());
}

#[test]
fn resolves_json_file() {
    let dir = tempdir().unwrap();
    write_file(dir.path(), "config.json", "{\"ok\":true}");
    let resolved = resolve_extension(&dir.path().join("config.json")).unwrap();
    assert_eq!(resolved.ext, "json");
    assert!(resolved.result.exists());
}

#[test]
fn resolves_cjs_and_mjs_extensions() {
    let dir = tempdir().unwrap();
    write_file(dir.path(), "mod.cjs", "module.exports = 1;");
    write_file(dir.path(), "mod2.mjs", "export const x = 1;");

    let r1 = resolve_extension(&dir.path().join("mod.cjs")).unwrap();
    assert_eq!(r1.ext, "cjs");

    let r2 = resolve_extension(&dir.path().join("mod2.mjs")).unwrap();
    assert_eq!(r2.ext, "mjs");
}
