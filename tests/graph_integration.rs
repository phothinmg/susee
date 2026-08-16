//! Integration tests for the full `dependensia` graph pipeline, mirroring
//! the TS suite `__tests__/test-suites/graph.test.ts`.
//!
//! These tests create temporary projects on disk, then invoke
//! `susee_lib::graph::dependensia` to collect and analyze dependencies.

use std::fs;
use std::path::Path;
use susee_lib::graph::dependensia;
use tempfile::tempdir;

fn write_file(dir: &Path, rel: &str, content: &str) {
    let full = dir.join(rel);
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(&full, content).unwrap();
}

fn write_package_json(dir: &Path, deps: &[(&str, &str)]) {
    let mut json = String::from("{\n  \"name\": \"tmp\",\n  \"version\": \"1.0.0\"");
    if !deps.is_empty() {
        json.push_str(",\n  \"dependencies\": {");
        for (i, (name, ver)) in deps.iter().enumerate() {
            if i > 0 {
                json.push(',');
            }
            json.push_str(&format!("\n    \"{}\": \"{}\"", name, ver));
        }
        json.push_str("\n  }");
    }
    json.push_str("\n}");
    fs::write(dir.join("package.json"), json).unwrap();
}

#[test]
fn collects_local_node_npm_and_unknown_dependencies() {
    let dir = tempdir().unwrap();
    write_package_json(dir.path(), &[("typescript", "^6.0.0")]);

    write_file(
        dir.path(),
        "src/entry.ts",
        [
            "import fs from 'fs';",
            "import ts from 'typescript';",
            "import helper from './lib';",
            "import equalImport = require('./eq');",
            "const util = require('./util');",
            "const pathMod = require('path');",
            "async function load() {",
            "  const dynamicMod = await import('./dynamic');",
            "  return dynamicMod;",
            "}",
            "import unknown from 'not-installed';",
            "export { fs, ts, helper, equalImport, util, pathMod, load, unknown };",
        ]
        .join("\n")
        .as_str(),
    );
    write_file(dir.path(), "src/util.ts", "export default 1;");
    write_file(dir.path(), "src/dynamic.ts", "export default 2;");
    write_file(dir.path(), "src/eq.ts", "export = 3;");
    write_file(dir.path(), "src/lib/index.ts", "export default 'lib';");

    let graph = dependensia("src/entry.ts", dir.path()).unwrap();

    let deps = graph.deps();
    let entry_deps = deps.get("src/entry.ts");
    assert!(entry_deps.is_some());
    let entry = entry_deps.unwrap();
    assert!(entry.contains(&"src/lib/index.ts".to_string()));
    assert!(entry.contains(&"src/util.ts".to_string()));
    assert!(entry.contains(&"src/dynamic.ts".to_string()));
    assert!(entry.contains(&"src/eq.ts".to_string()));

    let npm = graph.npm();
    assert!(npm.contains(&"typescript".to_string()));

    let node = graph.node();
    assert!(node.contains(&"fs".to_string()));
    assert!(node.contains(&"path".to_string()));

    let warning = graph.warn();
    assert!(warning.contains(&"not-installed".to_string()));

    let sorted = graph.sort();
    assert!(sorted.contains(&"src/entry.ts".to_string()));
    assert!(sorted.contains(&"src/util.ts".to_string()));
    assert!(sorted.contains(&"src/lib/index.ts".to_string()));
    // util should come before entry in topo sort
    let idx = |name: &str| sorted.iter().position(|s| s == name).unwrap();
    assert!(idx("src/util.ts") < idx("src/entry.ts"));
}

#[test]
fn handles_entry_path_without_file_extension() {
    let dir = tempdir().unwrap();
    write_package_json(dir.path(), &[]);
    write_file(
        dir.path(),
        "src/entry.ts",
        "import './dep'; export const ok = true;",
    );
    write_file(dir.path(), "src/dep.ts", "export const dep = 1;");

    let graph = dependensia("src/entry", dir.path()).unwrap();
    let deps = graph.deps();
    // The entry key preserves the given path (without extension).
    assert!(deps.contains_key("src/entry"));
    let entry = deps.get("src/entry").unwrap();
    assert!(entry.contains(&"src/dep.ts".to_string()));
    assert!(graph.warn().is_empty());
}

#[test]
fn deduplicates_npm_and_node_collections() {
    let dir = tempdir().unwrap();
    write_package_json(dir.path(), &[("typescript", "^6.0.0")]);

    write_file(
        dir.path(),
        "src/entry.ts",
        [
            "import fs from 'fs';",
            "import tsA from 'typescript';",
            "import tsB from 'typescript';",
            "import './a';",
            "export { fs, tsA, tsB };",
        ]
        .join("\n")
        .as_str(),
    );
    write_file(
        dir.path(),
        "src/a.ts",
        "import fs from 'fs'; export const a = fs;",
    );

    let graph = dependensia("src/entry.ts", dir.path()).unwrap();

    let npm = graph.npm();
    assert_eq!(npm.iter().filter(|n| *n == "typescript").count(), 1);

    let node = graph.node();
    assert_eq!(node.iter().filter(|n| *n == "fs").count(), 1);
}

#[test]
fn leaf_files_are_identified() {
    let dir = tempdir().unwrap();
    write_package_json(dir.path(), &[]);
    write_file(
        dir.path(),
        "src/entry.ts",
        "import './dep'; export const ok = true;",
    );
    write_file(dir.path(), "src/dep.ts", "export const dep = 1;");

    let graph = dependensia("src/entry.ts", dir.path()).unwrap();
    let leaves = graph.leaf();
    assert!(leaves.contains(&"src/dep.ts".to_string()));
}

#[test]
fn circular_dependencies_are_detected() {
    let dir = tempdir().unwrap();
    write_package_json(dir.path(), &[]);
    write_file(dir.path(), "src/a.ts", "import './b'; export const a = 1;");
    write_file(dir.path(), "src/b.ts", "import './a'; export const b = 2;");

    let graph = dependensia("src/a.ts", dir.path()).unwrap();
    let circular = graph.circular();
    assert!(!circular.is_empty());
}

#[test]
fn text_graph_contains_files() {
    let dir = tempdir().unwrap();
    write_package_json(dir.path(), &[]);
    write_file(
        dir.path(),
        "src/entry.ts",
        "import './dep'; export const ok = true;",
    );
    write_file(dir.path(), "src/dep.ts", "export const dep = 1;");

    let graph = dependensia("src/entry.ts", dir.path()).unwrap();
    let text = graph.text_graph();
    assert!(text.contains("src/entry.ts"));
    assert!(text.contains("src/dep.ts"));
}

#[test]
fn mutual_dependencies_are_found() {
    let dir = tempdir().unwrap();
    write_package_json(dir.path(), &[]);
    write_file(dir.path(), "src/a.ts", "import './b'; export const a = 1;");
    write_file(dir.path(), "src/b.ts", "import './a'; export const b = 2;");

    let graph = dependensia("src/a.ts", dir.path()).unwrap();
    let mutual = graph.mutual();
    assert_eq!(mutual.len(), 1);
}

#[test]
fn dependents_returns_files_that_depend_on_target() {
    let dir = tempdir().unwrap();
    write_package_json(dir.path(), &[]);
    write_file(
        dir.path(),
        "src/entry.ts",
        "import './dep'; export const ok = true;",
    );
    write_file(dir.path(), "src/dep.ts", "export const dep = 1;");

    let graph = dependensia("src/entry.ts", dir.path()).unwrap();
    let dependents = graph.dependents("src/dep.ts");
    // entry depends on dep, so dependents should include entry
    assert!(dependents.contains(&"src/entry.ts".to_string()));
}
