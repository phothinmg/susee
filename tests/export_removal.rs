use std::fs;
use tempfile::tempdir;

use susee::bundler::bundler;

/// Regression test: `export * from "..."` in a dependency file must be
/// removed by the bundler. Previously `ExportAllDeclaration` was missed
/// in `remove_exports`, so `export * from` leaked into the bundle.
#[test]
fn test_export_star_from_removed_from_deps() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    fs::write(root.join("dep.ts"), "export const x = 1;\n").unwrap();
    fs::write(root.join("middle.ts"), "export * from \"./dep.ts\";\n").unwrap();
    fs::write(
        root.join("entry.ts"),
        "import { x } from \"./middle.ts\";\nconsole.log(x);\n",
    )
    .unwrap();

    let out = bundler("entry.ts", root, &[]).expect("bundler failed");
    eprintln!("=== BUNDLED OUTPUT (export *) ===\n{out}\n======================");

    assert!(
        !out.contains("export *"),
        "`export * from` should be removed from dep file, got: {out}"
    );
}

/// `export { foo } from "..."` (re-export) in a dependency file must be removed.
#[test]
fn test_export_reexport_from_removed_from_deps() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    fs::write(root.join("dep.ts"), "export const x = 1;\n").unwrap();
    fs::write(root.join("middle.ts"), "export { x } from \"./dep.ts\";\n").unwrap();
    fs::write(
        root.join("entry.ts"),
        "import { x } from \"./middle.ts\";\nconsole.log(x);\n",
    )
    .unwrap();

    let out = bundler("entry.ts", root, &[]).expect("bundler failed");
    assert!(
        !out.contains("export { x }"),
        "`export {{ x }} from` should be removed from dep file, got: {out}"
    );
}

/// `export function/class/const` modifiers in dependency files must be stripped.
#[test]
fn test_export_modifiers_stripped_from_deps() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    fs::write(
        root.join("dep.ts"),
        "export function foo() { return 1; }\nexport const bar = 2;\nexport class Baz {}\n",
    )
    .unwrap();
    fs::write(
        root.join("entry.ts"),
        "import { foo, bar, Baz } from \"./dep.ts\";\nexport { foo };\nconsole.log(foo(), bar, new Baz());\n",
    )
    .unwrap();

    let out = bundler("entry.ts", root, &[]).expect("bundler failed");
    assert!(
        out.contains("export { foo }"),
        "entry export should be preserved, got: {out}"
    );
    assert!(!out.contains("export function foo"), "got: {out}");
    assert!(!out.contains("export const bar"), "got: {out}");
    assert!(!out.contains("export class Baz"), "got: {out}");
}

/// `export default function foo()` in a dependency file must be unwrapped.
#[test]
fn test_export_default_function_removed_from_deps() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    fs::write(
        root.join("dep.ts"),
        "export default function foo() { return 1; }\n",
    )
    .unwrap();
    fs::write(
        root.join("entry.ts"),
        "import foo from \"./dep.ts\";\nconsole.log(foo());\n",
    )
    .unwrap();

    let out = bundler("entry.ts", root, &[]).expect("bundler failed");
    assert!(
        !out.contains("export default"),
        "dep export default should be removed, got: {out}"
    );
}

/// `export type` / `export interface` in a dependency file must be stripped.
#[test]
fn test_export_type_removed_from_deps() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    fs::write(
        root.join("dep.ts"),
        "export type MyType = string | number;\nexport interface IFoo { bar: number; }\n",
    )
    .unwrap();
    fs::write(
        root.join("entry.ts"),
        "import type { MyType, IFoo } from \"./dep.ts\";\nconst x: MyType = \"hi\";\nconst y: IFoo = { bar: 1 };\nconsole.log(x, y);\n",
    )
    .unwrap();

    let out = bundler("entry.ts", root, &[]).expect("bundler failed");
    assert!(!out.contains("export type MyType"), "got: {out}");
    assert!(!out.contains("export interface IFoo"), "got: {out}");
}
