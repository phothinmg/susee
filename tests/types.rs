//! Unit tests for `dependencies::types` — ValidExts, ModuleType, and
//! (de)serialization behavior.

use susee::dependencies::types::{DependenciesTree, DepsFile, ModuleType, ValidExts};

#[test]
fn valid_exts_from_ext_parses_known_extensions() {
    assert_eq!(ValidExts::from_ext("ts"), Some(ValidExts::Ts));
    assert_eq!(ValidExts::from_ext("tsx"), Some(ValidExts::Tsx));
    assert_eq!(ValidExts::from_ext("js"), Some(ValidExts::Js));
    assert_eq!(ValidExts::from_ext("jsx"), Some(ValidExts::Jsx));
    assert_eq!(ValidExts::from_ext("cjs"), Some(ValidExts::Cjs));
    assert_eq!(ValidExts::from_ext("mjs"), Some(ValidExts::Mjs));
    assert_eq!(ValidExts::from_ext("cts"), Some(ValidExts::Cts));
    assert_eq!(ValidExts::from_ext("mts"), Some(ValidExts::Mts));
    assert_eq!(ValidExts::from_ext("json"), Some(ValidExts::Json));
}

#[test]
fn valid_exts_from_ext_rejects_unknown() {
    assert_eq!(ValidExts::from_ext("txt"), None);
    assert_eq!(ValidExts::from_ext(""), None);
    assert_eq!(ValidExts::from_ext("css"), None);
}

#[test]
fn valid_exts_from_path_ext_strips_leading_dot() {
    assert_eq!(ValidExts::from_path_ext(".ts"), Some(ValidExts::Ts));
    assert_eq!(ValidExts::from_path_ext(".tsx"), Some(ValidExts::Tsx));
    assert_eq!(ValidExts::from_path_ext("json"), Some(ValidExts::Json));
}

#[test]
fn valid_exts_as_ext_str_includes_dot() {
    assert_eq!(ValidExts::Ts.as_ext_str(), ".ts");
    assert_eq!(ValidExts::Tsx.as_ext_str(), ".tsx");
    assert_eq!(ValidExts::Js.as_ext_str(), ".js");
    assert_eq!(ValidExts::Json.as_ext_str(), ".json");
}

#[test]
fn valid_exts_serializes_as_dotted_str() {
    let json = serde_json::to_string(&ValidExts::Ts).unwrap();
    assert_eq!(json, "\".ts\"");

    let json = serde_json::to_string(&ValidExts::Tsx).unwrap();
    assert_eq!(json, "\".tsx\"");
}

#[test]
fn valid_exts_deserializes_from_dotted_str() {
    let ext: ValidExts = serde_json::from_str("\".mjs\"").unwrap();
    assert_eq!(ext, ValidExts::Mjs);

    let ext: ValidExts = serde_json::from_str("\".cts\"").unwrap();
    assert_eq!(ext, ValidExts::Cts);
}

#[test]
fn valid_exts_deserialize_rejects_unknown() {
    let result: Result<ValidExts, _> = serde_json::from_str("\".txt\"");
    assert!(result.is_err());
}

#[test]
fn module_type_serializes_as_lowercase() {
    assert_eq!(serde_json::to_string(&ModuleType::Cjs).unwrap(), "\"cjs\"");
    assert_eq!(serde_json::to_string(&ModuleType::Esm).unwrap(), "\"esm\"");
    assert_eq!(
        serde_json::to_string(&ModuleType::Json).unwrap(),
        "\"json\""
    );
}

#[test]
fn module_type_deserializes_from_lowercase() {
    let mt: ModuleType = serde_json::from_str("\"esm\"").unwrap();
    assert_eq!(mt, ModuleType::Esm);

    let mt: ModuleType = serde_json::from_str("\"cjs\"").unwrap();
    assert_eq!(mt, ModuleType::Cjs);
}

#[test]
fn module_type_as_str_returns_canonical_form() {
    assert_eq!(ModuleType::Cjs.as_str(), "cjs");
    assert_eq!(ModuleType::Esm.as_str(), "esm");
    assert_eq!(ModuleType::Json.as_str(), "json");
}

#[test]
fn deps_file_serializes_with_snake_case_fields() {
    let dep = DepsFile {
        file: "src/index.ts".to_string(),
        content: "export const x = 1;".to_string(),
        bytes: 20,
        module_type: ModuleType::Esm,
        file_ext: ValidExts::Ts,
        is_jsx: false,
        is_entry: true,
    };
    let json = serde_json::to_string(&dep).unwrap();
    assert!(json.contains("\"module_type\""));
    assert!(json.contains("\"file_ext\""));
    assert!(json.contains("\"is_jsx\""));
    assert!(json.contains("\"is_entry\""));
}

#[test]
fn dependencies_tree_round_trips_through_json() {
    let tree = DependenciesTree {
        entry: "src/index.ts".to_string(),
        npm: vec!["typescript".to_string()],
        nodes: vec!["fs".to_string()],
        warns: vec![],
        dep_files: vec![DepsFile {
            file: "src/index.ts".to_string(),
            content: "export const x = 1;".to_string(),
            bytes: 20,
            module_type: ModuleType::Esm,
            file_ext: ValidExts::Ts,
            is_jsx: false,
            is_entry: true,
        }],
    };
    let json = serde_json::to_string(&tree).unwrap();
    let parsed: DependenciesTree = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.entry, "src/index.ts");
    assert_eq!(parsed.npm, vec!["typescript".to_string()]);
    assert_eq!(parsed.nodes, vec!["fs".to_string()]);
    assert_eq!(parsed.dep_files.len(), 1);
    assert_eq!(parsed.dep_files[0].file, "src/index.ts");
    assert_eq!(parsed.dep_files[0].module_type, ModuleType::Esm);
}
