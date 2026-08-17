//! Node-type predicates.
//!
//! Ported conceptually from the `ts.isXxx(node)` family
//! (`ts.isImportDeclaration`, `ts.isExportDeclaration`, `ts.isIdentifier`,
//! etc.).
//!
//! Because the AST is exposed as JSON (see [`super`]), these predicates
//! inspect a `serde_json::Value` node and check its discriminant. oxc's
//! serde representation tags each node with a `type` field whose value is
//! the oxc enum variant name (e.g. `"ImportDeclaration"`,
//! `"ExportNamedDeclaration"`, `"Identifier"`, ...). The predicates match
//! on that field so JS plugins can branch on node kind without knowing the
//! oxc internals.
//!
//! ## Usage from JS
//! ```js
//! const node = { type: "ImportDeclaration", ... };
//! suseeNative.isImportDeclaration(node); // true
//! ```
//!
//! ## Why not a single `nodeType(node)` function?
//! The `ts.isXxx` family is how plugin authors already branch, so we keep
//! the same ergonomics. A `nodeType` getter is also available on every
//! node via its `type` JSON field.

use napi_derive::napi;

/// Read the `type` discriminant of a JSON AST node, if present.
fn node_kind(node: &serde_json::Value) -> Option<&str> {
    node.get("type").and_then(|v| v.as_str())
}

/// `true` when `node` is an `ImportDeclaration`.
///
/// Mirrors `ts.isImportDeclaration`.
#[napi]
pub fn is_import_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("ImportDeclaration")
}

/// `true` when `node` is an `ExportNamedDeclaration`.
///
/// Mirrors `ts.isExportDeclaration` (oxc splits named/default/all exports
/// into separate variants).
#[napi]
pub fn is_export_named_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("ExportNamedDeclaration")
}

/// `true` when `node` is an `ExportDefaultDeclaration`.
///
/// Mirrors `ts.isExportAssignment` / `ts.isExportDefaultDeclaration`.
#[napi]
pub fn is_export_default_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("ExportDefaultDeclaration")
}

/// `true` when `node` is an `ExportAllDeclaration` (`export * from`).
#[napi]
pub fn is_export_all_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("ExportAllDeclaration")
}

/// `true` when `node` is an `Identifier` reference.
///
/// Mirrors `ts.isIdentifier`.
#[napi]
pub fn is_identifier(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("Identifier")
}

/// `true` when `node` is a `VariableDeclaration`.
///
/// Mirrors `ts.isVariableStatement` / `ts.isVariableDeclaration`.
#[napi]
pub fn is_variable_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("VariableDeclaration")
}

/// `true` when `node` is a `FunctionDeclaration`.
///
/// Mirrors `ts.isFunctionDeclaration`.
#[napi]
pub fn is_function_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("FunctionDeclaration")
}

/// `true` when `node` is a `ClassDeclaration`.
///
/// Mirrors `ts.isClassDeclaration`.
#[napi]
pub fn is_class_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("ClassDeclaration")
}

/// `true` when `node` is a `CallExpression`.
///
/// Mirrors `ts.isCallExpression`.
#[napi]
pub fn is_call_expression(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("CallExpression")
}

/// `true` when `node` is a `StringLiteral`.
///
/// Mirrors `ts.isStringLiteral`.
#[napi]
pub fn is_string_literal(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("StringLiteral")
}

/// `true` when `node` is a `TSTypeAliasDeclaration` (`type Foo = ...`).
///
/// Mirrors `ts.isTypeAliasDeclaration`.
#[napi]
pub fn is_type_alias_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("TSTypeAliasDeclaration")
}

/// `true` when `node` is a `TSInterfaceDeclaration`.
///
/// Mirrors `ts.isInterfaceDeclaration`.
#[napi]
pub fn is_interface_declaration(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("TSInterfaceDeclaration")
}

/// `true` when `node` is a `JSXElement`.
///
/// Mirrors `ts.isJsxElement`.
#[napi]
pub fn is_jsx_element(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("JSXElement")
}

/// `true` when `node` is a `JSXFragment`.
///
/// Mirrors `ts.isJsxFragment`.
#[napi]
pub fn is_jsx_fragment(node: serde_json::Value) -> bool {
    node_kind(&node) == Some("JSXFragment")
}

/// Return the node's `type` discriminant as a string, or `null`.
///
/// Useful for debugging or building generic visitors:
/// ```js
/// const kind = suseeNative.nodeType(node);
/// if (kind === "ImportDeclaration") { ... }
/// ```
#[napi]
pub fn node_type(node: serde_json::Value) -> Option<String> {
    node_kind(&node).map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn predicates_match_type_field() {
        assert!(is_import_declaration(json!({"type": "ImportDeclaration"})));
        assert!(!is_import_declaration(json!({"type": "Identifier"})));
        assert!(is_identifier(json!({"type": "Identifier"})));
        assert!(is_export_named_declaration(
            json!({"type": "ExportNamedDeclaration"})
        ));
        assert!(is_export_default_declaration(
            json!({"type": "ExportDefaultDeclaration"})
        ));
        assert!(is_export_all_declaration(
            json!({"type": "ExportAllDeclaration"})
        ));
        assert!(is_variable_declaration(
            json!({"type": "VariableDeclaration"})
        ));
        assert!(is_function_declaration(
            json!({"type": "FunctionDeclaration"})
        ));
        assert!(is_class_declaration(json!({"type": "ClassDeclaration"})));
        assert!(is_call_expression(json!({"type": "CallExpression"})));
        assert!(is_string_literal(json!({"type": "StringLiteral"})));
        assert!(is_type_alias_declaration(
            json!({"type": "TSTypeAliasDeclaration"})
        ));
        assert!(is_interface_declaration(
            json!({"type": "TSInterfaceDeclaration"})
        ));
        assert!(is_jsx_element(json!({"type": "JSXElement"})));
        assert!(is_jsx_fragment(json!({"type": "JSXFragment"})));
    }

    #[test]
    fn node_type_returns_discriminant() {
        assert_eq!(
            node_type(json!({"type": "ImportDeclaration"})),
            Some("ImportDeclaration".to_string())
        );
        assert_eq!(node_type(json!({"foo": 1})), None);
    }

    #[test]
    fn predicates_false_for_unknown_types() {
        assert!(!is_function_declaration(json!({"type": "SomethingElse"})));
        assert!(!is_identifier(json!({})));
    }
}
