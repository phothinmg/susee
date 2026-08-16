//! Unit tests for `dependencies::duplicates::check_duplicates`, mirroring
//! the TS suite `__tests__/test-suites/dependencies.duplicates.test.ts`.

use susee::dependencies::duplicates::check_duplicates;
use susee::dependencies::types::{DepsFile, ModuleType, ValidExts};

fn create_dep_file(file: &str, content: &str) -> DepsFile {
    DepsFile {
        file: file.to_string(),
        content: content.to_string(),
        bytes: content.len(),
        module_type: ModuleType::Esm,
        file_ext: ValidExts::Ts,
        is_jsx: false,
        is_entry: false,
    }
}

#[test]
fn no_duplicates_returns_empty() {
    let dep_files = vec![
        create_dep_file("src/a.ts", "export const alpha = 1;"),
        create_dep_file("src/b.ts", "export const beta = 2;"),
    ];
    let dups = check_duplicates(&dep_files);
    assert!(dups.is_empty());
}

#[test]
fn detects_top_level_duplicate_across_files() {
    // Same name `shared` at top-level in two files → duplicate
    let dep_files = vec![
        create_dep_file("src/a.ts", "export const shared = 1;"),
        create_dep_file("src/b.ts", "export const shared = 2;"),
    ];
    let dups = check_duplicates(&dep_files);
    assert_eq!(dups.len(), 1);
    assert_eq!(dups[0].name, "shared");
    assert_eq!(dups[0].locations.len(), 2);
}

#[test]
fn ignores_duplicate_names_in_different_nested_scopes() {
    // `value` is declared in different namespaces and function scopes — not a
    // duplicate because scopes differ.
    let dep_files = vec![
        create_dep_file(
            "src/a.ts",
            [
                "namespace One {",
                "  export const value = 1;",
                "}",
                "export function alpha() {",
                "  const local = 1;",
                "  return local;",
                "}",
            ]
            .join("\n")
            .as_str(),
        ),
        create_dep_file(
            "src/b.ts",
            [
                "namespace Two {",
                "  export const value = 2;",
                "}",
                "export function beta() {",
                "  const local = 2;",
                "  return local;",
                "}",
            ]
            .join("\n")
            .as_str(),
        ),
    ];
    let dups = check_duplicates(&dep_files);
    assert!(dups.is_empty(), "expected no duplicates, got {dups:?}");
}

#[test]
fn detects_duplicate_function_declarations_at_top_level() {
    let dep_files = vec![
        create_dep_file("src/a.ts", "export function foo() { return 1; }"),
        create_dep_file("src/b.ts", "export function foo() { return 2; }"),
    ];
    let dups = check_duplicates(&dep_files);
    assert_eq!(dups.len(), 1);
    assert_eq!(dups[0].name, "foo");
}

#[test]
fn detects_duplicate_class_declarations_at_top_level() {
    let dep_files = vec![
        create_dep_file("src/a.ts", "export class Bar {}"),
        create_dep_file("src/b.ts", "export class Bar {}"),
    ];
    let dups = check_duplicates(&dep_files);
    assert_eq!(dups.len(), 1);
    assert_eq!(dups[0].name, "Bar");
}

#[test]
fn detects_duplicate_type_alias_declarations() {
    let dep_files = vec![
        create_dep_file("src/a.ts", "export type ID = string;"),
        create_dep_file("src/b.ts", "export type ID = number;"),
    ];
    let dups = check_duplicates(&dep_files);
    assert_eq!(dups.len(), 1);
    assert_eq!(dups[0].name, "ID");
}

#[test]
fn detects_duplicate_interface_declarations() {
    let dep_files = vec![
        create_dep_file("src/a.ts", "export interface Foo { a: number; }"),
        create_dep_file("src/b.ts", "export interface Foo { b: string; }"),
    ];
    let dups = check_duplicates(&dep_files);
    assert_eq!(dups.len(), 1);
    assert_eq!(dups[0].name, "Foo");
}

#[test]
fn detects_duplicate_enum_declarations() {
    let dep_files = vec![
        create_dep_file("src/a.ts", "export enum Color { Red, Green }"),
        create_dep_file("src/b.ts", "export enum Color { Blue, Yellow }"),
    ];
    let dups = check_duplicates(&dep_files);
    assert_eq!(dups.len(), 1);
    assert_eq!(dups[0].name, "Color");
}

#[test]
fn same_name_in_same_function_scope_is_not_global_duplicate() {
    // Two functions with the same local variable name in different function
    // bodies are not duplicates.
    let dep_files = vec![create_dep_file(
        "src/a.ts",
        [
            "export function foo() {",
            "  const tmp = 1;",
            "  return tmp;",
            "}",
            "export function bar() {",
            "  const tmp = 2;",
            "  return tmp;",
            "}",
        ]
        .join("\n")
        .as_str(),
    )];
    let dups = check_duplicates(&dep_files);
    assert!(dups.is_empty(), "expected no duplicates, got {dups:?}");
}

#[test]
fn duplicate_locations_include_file_path() {
    let dep_files = vec![
        create_dep_file("src/a.ts", "export const shared = 1;"),
        create_dep_file("src/b.ts", "export const shared = 2;"),
    ];
    let dups = check_duplicates(&dep_files);
    assert_eq!(dups.len(), 1);
    let files: Vec<&str> = dups[0].locations.iter().map(|l| l.file.as_str()).collect();
    assert!(files.contains(&"src/a.ts"));
    assert!(files.contains(&"src/b.ts"));
}

#[test]
fn duplicate_locations_have_line_and_column() {
    let dep_files = vec![
        create_dep_file("src/a.ts", "export const shared = 1;"),
        create_dep_file("src/b.ts", "export const shared = 2;"),
    ];
    let dups = check_duplicates(&dep_files);
    assert_eq!(dups.len(), 1);
    for loc in &dups[0].locations {
        assert!(loc.line >= 1);
        assert!(loc.column >= 1);
    }
}

#[test]
fn empty_input_returns_empty() {
    let dups = check_duplicates(&[]);
    assert!(dups.is_empty());
}
