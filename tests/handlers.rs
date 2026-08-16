//! Unit tests for `graph::handlers::collect_module_specifiers`, mirroring
//! the import/require/dynamic-import detection covered by the TS graph suite.

use susee_lib::graph::handlers::collect_module_specifiers;
use std::path::Path;

fn specifiers(source: &str, file_name: &str) -> Vec<String> {
    let mut result = collect_module_specifiers(source, Path::new(file_name));
    result.sort();
    result
}

#[test]
fn collects_esm_import_specifiers() {
    let source = [
        "import fs from 'fs';",
        "import ts from 'typescript';",
        "import helper from './lib';",
        "export { fs, ts, helper };",
    ]
    .join("\n");
    let specs = specifiers(&source, "entry.ts");
    assert!(specs.contains(&"fs".to_string()));
    assert!(specs.contains(&"typescript".to_string()));
    assert!(specs.contains(&"./lib".to_string()));
}

#[test]
fn collects_ts_import_equals_require() {
    let source = "import equalImport = require('./eq');";
    let specs = specifiers(&source, "entry.ts");
    assert!(specs.contains(&"./eq".to_string()));
}

#[test]
fn collects_commonjs_require_calls() {
    let source = [
        "const util = require('./util');",
        "const pathMod = require('path');",
        "module.exports = { util, pathMod };",
    ]
    .join("\n");
    let specs = specifiers(&source, "entry.ts");
    assert!(specs.contains(&"./util".to_string()));
    assert!(specs.contains(&"path".to_string()));
}

#[test]
fn collects_dynamic_import_expressions() {
    let source = [
        "async function load() {",
        "  const dynamicMod = await import('./dynamic');",
        "  return dynamicMod;",
        "}",
    ]
    .join("\n");
    let specs = specifiers(&source, "entry.ts");
    assert!(specs.contains(&"./dynamic".to_string()));
}

#[test]
fn collects_node_prefixed_specifiers() {
    let source = "import { readFileSync } from 'node:fs';";
    let specs = specifiers(&source, "entry.ts");
    assert!(specs.contains(&"node:fs".to_string()));
}

#[test]
fn collects_bare_side_effect_imports() {
    let source = "import './polyfill';";
    let specs = specifiers(&source, "entry.ts");
    assert!(specs.contains(&"./polyfill".to_string()));
}

#[test]
fn handles_file_without_imports() {
    let source = "export const x = 1;";
    let specs = specifiers(&source, "entry.ts");
    assert!(specs.is_empty());
}

#[test]
fn handles_tsx_file_with_jsx() {
    let source = [
        "import React from 'react';",
        "export const App = () => <div>Hello</div>;",
    ]
    .join("\n");
    let specs = specifiers(&source, "component.tsx");
    assert!(specs.contains(&"react".to_string()));
}

#[test]
fn collects_multiple_specifiers_in_order() {
    let source = [
        "import a from './a';",
        "import b from './b';",
        "import c from './c';",
    ]
    .join("\n");
    let specs = collect_module_specifiers(&source, Path::new("entry.ts"));
    // All three should be present
    assert_eq!(specs.len(), 3);
    assert!(specs.contains(&"./a".to_string()));
    assert!(specs.contains(&"./b".to_string()));
    assert!(specs.contains(&"./c".to_string()));
}

#[test]
fn collects_export_all_specifiers() {
    let source = "export * from './utils';";
    let specs = specifiers(source, "entry.ts");
    assert!(specs.contains(&"./utils".to_string()));
}

#[test]
fn collects_named_re_export_specifiers() {
    let source = "export { foo } from './foo';";
    let specs = specifiers(source, "entry.ts");
    assert!(specs.contains(&"./foo".to_string()));
}