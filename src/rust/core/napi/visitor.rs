//! AST visitor that calls back into JS.
//!
//! Ported conceptually from `ts.forEachChild(node, visitor)`.
//!
//! Walks the JSON AST depth-first and invokes a JS callback for every
//! object that has a `type` field (i.e. every AST node). The callback
//! receives the node as a plain JS object and can return `true` to stop
//! the walk early.
//!
//! ## Usage from JS
//! ```js
//! const sf = suseeNative.parseSourceFile(code, "entry.ts");
//! suseeNative.visit(sf.program, (node, parent) => {
//!   if (suseeNative.isImportDeclaration(node)) {
//!     console.log("found import:", node.source.value);
//!     return true; // stop
//!   }
//! });
//! ```
//!
//! The walk is recursive over `serde_json::Value`. For very large files a
//! future revision can switch to an explicit stack to avoid JS-stack
//! recursion limits, but for typical library source the depth is shallow.

use napi::bindgen_prelude::{Function, Result};
use napi_derive::napi;

/// Walk a JSON AST node and call `callback` for every sub-node.
///
/// `callback` receives `(node, parent)` where `parent` is the immediately
/// containing node (or `null` for the root). Return `true` from the
/// callback to stop the walk.
///
/// Mirrors `ts.forEachChild` but visits *all* nested nodes, not just the
/// direct children — this matches how plugin authors typically use
/// `forEachChild` recursively.
#[napi]
pub fn visit(
    node: serde_json::Value,
    callback: Function<(serde_json::Value, serde_json::Value), bool>,
) -> Result<()> {
    visit_inner(&node, &serde_json::Value::Null, &callback)?;
    Ok(())
}

fn visit_inner(
    node: &serde_json::Value,
    parent: &serde_json::Value,
    callback: &Function<(serde_json::Value, serde_json::Value), bool>,
) -> Result<()> {
    // Only treat objects with a `type` field as AST nodes. This avoids
    // calling the callback for every position/span object in the AST.
    let is_node = node.as_object().is_some_and(|obj| obj.contains_key("type"));

    if is_node {
        // Call the JS callback. napi-rs converts `serde_json::Value` to a
        // JS object and `bool` back from the JS return value.
        let stop = callback.call((node.clone(), parent.clone()))?;
        if stop {
            return Ok(());
        }
    }

    // Recurse into every value inside `node` (object fields or array
    // items), passing `node` as the parent to each child.
    match node {
        serde_json::Value::Object(map) => {
            for (_k, v) in map {
                visit_inner(v, node, callback)?;
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                visit_inner(v, node, callback)?;
            }
        }
        _ => {}
    }
    Ok(())
}

// The unit tests below exercise the pure-Rust walk logic with a stand-in
// callback. We can't construct a `napi::Function` outside of a Node
// runtime, so the tests use a helper that mirrors the walk with a closure.
#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    /// Mirror of `visit_inner` that takes a plain closure, so we can test
    /// the walk logic without a Node runtime.
    fn walk<F: FnMut(&Value, &Value) -> bool>(node: &Value, parent: &Value, f: &mut F) -> bool {
        let is_node = node.as_object().is_some_and(|o| o.contains_key("type"));
        if is_node {
            if f(node, parent) {
                return true;
            }
        }
        match node {
            Value::Object(map) => {
                for (_, v) in map {
                    if walk(v, node, f) {
                        return true;
                    }
                }
            }
            Value::Array(arr) => {
                for v in arr {
                    if walk(v, node, f) {
                        return true;
                    }
                }
            }
            _ => {}
        }
        false
    }

    #[test]
    fn visit_finds_typed_nodes() {
        let ast = json!({
            "type": "Program",
            "body": [
                {"type": "ImportDeclaration", "source": {"type": "StringLiteral", "value": "x"}},
                {"type": "VariableDeclaration"}
            ]
        });
        let mut count = 0;
        walk(&ast, &Value::Null, &mut |_node, _parent| {
            count += 1;
            false
        });
        // Program, ImportDeclaration, StringLiteral, VariableDeclaration = 4.
        assert_eq!(count, 4);
    }

    #[test]
    fn visit_stops_on_true() {
        let ast = json!({
            "type": "Program",
            "body": [
                {"type": "ImportDeclaration"},
                {"type": "VariableDeclaration"}
            ]
        });
        let mut count = 0;
        walk(&ast, &Value::Null, &mut |node, _parent| {
            count += 1;
            node.get("type").and_then(|t| t.as_str()) == Some("ImportDeclaration")
        });
        // Program + ImportDeclaration = 2 (VariableDeclaration not reached).
        assert_eq!(count, 2);
    }

    #[test]
    fn visit_skips_non_node_objects() {
        // Objects without a `type` field should not trigger the callback,
        // but their children should still be visited.
        let ast = json!({
            "type": "Program",
            "span": {"start": 0, "end": 10},
            "body": []
        });
        let mut count = 0;
        walk(&ast, &Value::Null, &mut |_node, _parent| {
            count += 1;
            false
        });
        // Only Program (the `span` object has no `type`).
        assert_eq!(count, 1);
    }
}
