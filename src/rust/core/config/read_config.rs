use super::entry_point::SuSeeConfig;
use oxc::allocator::Allocator;
use oxc::ast::ast::{
    ArrayExpressionElement, BindingPattern, ExportDefaultDeclarationKind, Expression,
    ObjectPropertyKind, Statement, UnaryOperator,
};
use oxc::parser::Parser;
use oxc::span::SourceType;
use std::{fs, path};

/// Reads and parses a susee config file (`.ts` or `.js`) and returns
/// the deserialized [`SuSeeConfig`].
///
/// The config file must have an `export default <expression>` statement.
/// The expression is evaluated statically — only literal values (objects,
/// arrays, strings, numbers, booleans, `null`/`undefined`) and top-level
/// identifier references (e.g. `const config = { … }; export default config`)
/// are supported.
///
/// # Errors
///
/// Returns an error if the file cannot be read, the source cannot be parsed,
/// no `export default` is found, the default export is not a static object
/// literal, or the resulting JSON does not deserialize into [`SuSeeConfig`].
pub fn read_config_file(entry: &str) -> Result<SuSeeConfig, String> {
    let file_path = path::Path::new(entry);
    let raw_config_text = fs::read_to_string(file_path)
        .map_err(|e| format!("failed to read {}: {e}", file_path.display()))?;

    let source_type = detect_source_type_from_extension(entry);

    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, &raw_config_text, source_type);
    let parsed = parser.parse();
    if parsed.panicked {
        let diags = parsed
            .diagnostics
            .iter()
            .map(|d| format!("{d}"))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!("failed to parse config file: {diags}"));
    }
    let program = parsed.program;

    // Find the `export default` expression.
    let default_expr = find_export_default(&program.body)
        .ok_or_else(|| "no default export found in config file".to_string())?;

    // Convert the AST expression to a JSON value.
    let json_value = expression_to_json(&program.body, default_expr)
        .map_err(|e| format!("failed to evaluate config expression: {e}"))?;

    // Deserialize into SuSeeConfig.
    serde_json::from_value::<SuSeeConfig>(json_value)
        .map_err(|e| format!("failed to deserialize config: {e}"))
}

/// Determine the oxc [`SourceType`] from the file extension.
fn detect_source_type_from_extension(entry: &str) -> SourceType {
    if entry.ends_with(".ts") || entry.ends_with(".mts") {
        SourceType::ts()
    } else if entry.ends_with(".tsx") {
        SourceType::tsx()
    } else if entry.ends_with(".cts") {
        SourceType::cjs().with_typescript(true)
    } else if entry.ends_with(".cjs") {
        SourceType::cjs()
    } else {
        // .js, .mjs, or unknown — assume ESM.
        SourceType::mjs()
    }
}

/// Find the `export default` expression in the program body.
///
/// Returns `None` if there is no `export default` statement, or if the
/// default export is a function/class/interface declaration rather than
/// an expression.
fn find_export_default<'a>(body: &'a [Statement<'a>]) -> Option<&'a Expression<'a>> {
    for stmt in body {
        if let Statement::ExportDefaultDeclaration(exp) = stmt {
            match &exp.declaration {
                // Function/class/interface declarations are not config objects.
                ExportDefaultDeclarationKind::FunctionDeclaration(_)
                | ExportDefaultDeclarationKind::ClassDeclaration(_)
                | ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => return None,
                // Everything else is an expression (inherited from `Expression`).
                _ => return Some(exp.declaration.to_expression()),
            }
        }
    }
    None
}

/// Resolve an identifier reference to its initializer expression in the
/// program body (top-level `const`/`let`/`var` declarations only).
fn resolve_identifier<'a>(
    body: &'a [Statement<'a>],
    name: &str,
) -> Option<&'a Expression<'a>> {
    for stmt in body {
        if let Statement::VariableDeclaration(var_decl) = stmt {
            for declarator in &var_decl.declarations {
                if let BindingPattern::BindingIdentifier(bi) = &declarator.id {
                    if bi.name.as_str() == name {
                        if let Some(init) = &declarator.init {
                            return Some(init);
                        }
                    }
                }
            }
        }
    }
    None
}

/// Recursively convert an oxc AST expression to a [`serde_json::Value`].
///
/// Supported expression types:
/// - `ObjectExpression` → JSON object
/// - `ArrayExpression` → JSON array
/// - `StringLiteral` → JSON string
/// - `TemplateLiteral` (no interpolation) → JSON string
/// - `NumericLiteral` → JSON number
/// - `BooleanLiteral` → JSON bool
/// - `NullLiteral` → JSON null
/// - `Identifier` → `undefined` → null; otherwise resolved from top-level
///   declarations
/// - `ParenthesizedExpression` → unwrapped
/// - `UnaryExpression` (`-number`) → negated number
fn expression_to_json<'a>(
    body: &'a [Statement<'a>],
    expr: &'a Expression<'a>,
) -> Result<serde_json::Value, String> {
    match expr {
        // { key: value, … }
        Expression::ObjectExpression(obj) => {
            let mut map = serde_json::Map::new();
            for prop_kind in &obj.properties {
                match prop_kind {
                    ObjectPropertyKind::ObjectProperty(prop) => {
                        let key = prop
                            .key
                            .static_name()
                            .ok_or_else(|| "non-static property key in config".to_string())?
                            .to_string();
                        let value = expression_to_json(body, &prop.value)?;
                        map.insert(key, value);
                    }
                    ObjectPropertyKind::SpreadProperty(_) => {
                        return Err("spread properties are not supported in config".to_string());
                    }
                }
            }
            Ok(serde_json::Value::Object(map))
        }

        // [elem, …]
        Expression::ArrayExpression(arr) => {
            let mut elems = Vec::new();
            for elem in &arr.elements {
                if let Some(expr) = elem.as_expression() {
                    elems.push(expression_to_json(body, expr)?);
                } else if matches!(elem, ArrayExpressionElement::SpreadElement(_)) {
                    return Err("spread elements are not supported in config".to_string());
                } else {
                    // Elision (array hole) → null.
                    elems.push(serde_json::Value::Null);
                }
            }
            Ok(serde_json::Value::Array(elems))
        }

        // "string" or 'string'
        Expression::StringLiteral(lit) => Ok(serde_json::Value::String(lit.value.to_string())),

        // 42, 3.14
        Expression::NumericLiteral(lit) => {
            let n = lit.value;
            if n.fract() == 0.0 && n.is_finite() && n.abs() < i64::MAX as f64 {
                Ok(serde_json::Value::from(n as i64))
            } else {
                Ok(serde_json::Value::from(n))
            }
        }

        // true / false
        Expression::BooleanLiteral(lit) => Ok(serde_json::Value::Bool(lit.value)),

        // null
        Expression::NullLiteral(_) => Ok(serde_json::Value::Null),

        // `template` (no interpolation)
        Expression::TemplateLiteral(lit) => {
            if let Some(s) = lit.single_quasi() {
                Ok(serde_json::Value::String(s.to_string()))
            } else {
                Err("template literals with expressions are not supported in config".to_string())
            }
        }

        // identifier reference (e.g. `undefined` or a variable name)
        Expression::Identifier(ident) => {
            let name = ident.name.as_str();
            if name == "undefined" {
                return Ok(serde_json::Value::Null);
            }
            // Try to resolve as a top-level variable reference.
            if let Some(init) = resolve_identifier(body, name) {
                expression_to_json(body, init)
            } else {
                Err(format!(
                    "unsupported identifier '{name}' in config (only literal values and top-level variable references are supported)"
                ))
            }
        }

        // (expr)
        Expression::ParenthesizedExpression(p) => expression_to_json(body, &p.expression),

        // -42 (unary negation)
        Expression::UnaryExpression(unary) => {
            if matches!(unary.operator, UnaryOperator::UnaryNegation) {
                if let Expression::NumericLiteral(lit) = &unary.argument {
                    let n = lit.value;
                    if n.fract() == 0.0 && n.is_finite() && n.abs() < i64::MAX as f64 {
                        return Ok(serde_json::Value::from(-(n as i64)));
                    }
                    return Ok(serde_json::Value::from(-n));
                }
            }
            Err("unsupported unary expression in config".to_string())
        }

        _ => Err("unsupported expression type in config".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reads the project's own `susee.config.ts` and verifies the entry points.
    #[test]
    fn reads_project_config() {
        let config = read_config_file("susee.config.ts").expect("should read config file");
        assert!(!config.entry_points.is_empty(), "should have at least one entry point");
        assert_eq!(config.entry_points[0].entry, "src/index.ts");
        assert_eq!(config.entry_points[0].export_path, ".");
    }

    /// A simple inline config with `export default { … }`.
    #[test]
    fn reads_inline_default_export() {
        let dir = std::env::temp_dir();
        let path = dir.join("susee_test_inline.config.ts");
        let content = r#"
export default {
  entryPoints: [
    { entry: "src/foo.ts", exportPath: "." },
  ],
  outDir: "build",
  allowUpdatePackageJson: true,
};
"#;
        std::fs::write(&path, content).unwrap();
        let config = read_config_file(path.to_str().unwrap()).expect("should parse inline config");
        assert_eq!(config.entry_points.len(), 1);
        assert_eq!(config.entry_points[0].entry, "src/foo.ts");
        assert_eq!(config.entry_points[0].export_path, ".");
        assert_eq!(config.out_dir.as_deref(), Some("build"));
        assert_eq!(config.allow_update_package_json, Some(true));
        let _ = std::fs::remove_file(&path);
    }

    /// A config using `const config = { … }; export default config;`.
    #[test]
    fn reads_named_variable_default_export() {
        let dir = std::env::temp_dir();
        let path = dir.join("susee_test_named.config.ts");
        let content = r#"
import type { SuSeeConfig } from "susee";
const config: SuSeeConfig = {
  entryPoints: [
    { entry: "src/bar.ts", exportPath: "./bar" },
    { entry: "src/baz.ts", exportPath: "./baz" },
  ],
};
export default config;
"#;
        std::fs::write(&path, content).unwrap();
        let config = read_config_file(path.to_str().unwrap()).expect("should parse named config");
        assert_eq!(config.entry_points.len(), 2);
        assert_eq!(config.entry_points[0].entry, "src/bar.ts");
        assert_eq!(config.entry_points[1].export_path, "./baz");
        let _ = std::fs::remove_file(&path);
    }

    /// The variable name can be anything — not just `config`.
    #[test]
    fn reads_arbitrary_variable_name() {
        let dir = std::env::temp_dir();
        let path = dir.join("susee_test_arbitrary_name.config.ts");
        let content = r#"
const mySettings = {
  entryPoints: [
    { entry: "src/qux.ts", exportPath: "./qux" },
  ],
  outDir: "out",
};
export default mySettings;
"#;
        std::fs::write(&path, content).unwrap();
        let config =
            read_config_file(path.to_str().unwrap()).expect("should parse arbitrary-name config");
        assert_eq!(config.entry_points.len(), 1);
        assert_eq!(config.entry_points[0].entry, "src/qux.ts");
        assert_eq!(config.entry_points[0].export_path, "./qux");
        assert_eq!(config.out_dir.as_deref(), Some("out"));
        let _ = std::fs::remove_file(&path);
    }
}
