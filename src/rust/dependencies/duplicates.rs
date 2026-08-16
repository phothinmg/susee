//! Detect duplicate declarations across the dependency files.
//!
//! Ported from `node_src/dependencies/duplicates.ts`.
//!
//! The original TypeScript implementation uses the TS compiler API to walk the
//! AST, track scopes (module/namespace, class, function, arrow, method, block),
//! and collect declaration names (variable statements with identifier names,
//! function/class/enum/interface/type-alias declarations). When the same name
//! is declared more than once within the same scope, it reports a warning and
//! exits.
//!
//! This port uses the oxc parser instead of the TS compiler API. It mirrors the
//! same scope-tracking and declaration-collection logic for the common cases:
//! top-level (global) scope, function bodies, block statements, and
//! namespace/module declarations.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use oxc::allocator::Allocator;
use oxc::ast::ast::{
    ArrowFunctionBody, BindingPattern, Expression, FunctionBody, Statement,
    TSNamespaceDeclarationBody,
};
use oxc::parser::Parser;
use oxc::span::SourceType;

use super::types::DepsFile;

/// A declaration location: file path, 1-based line, 1-based column.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct DuplicateDeclarationLocation {
    pub file: String,
    pub line: usize,
    pub column: usize,
}

/// A name that may be duplicated, with the set of locations where it's declared.
#[derive(Debug, Clone, Default)]
pub struct DuplicateScopeEntry {
    pub name: String,
    pub locations: BTreeSet<DuplicateDeclarationLocation>,
}

/// Map of `scopeKey::name` → [`DuplicateScopeEntry`].
pub type DuplicateNameMap = BTreeMap<String, DuplicateScopeEntry>;

/// A duplicate declaration finding: the name and all locations.
#[derive(Debug, Clone)]
pub struct DuplicateDeclaration {
    pub name: String,
    #[allow(dead_code)]
    pub locations: Vec<DuplicateDeclarationLocation>,
}

/// Check the dependency tree for duplicate declarations.
///
/// Returns the list of duplicate declarations (names declared more than once
/// within the same scope).
///
/// Unlike the TS version — which prints warnings and calls `process.exit(1)` —
/// this function is pure: it returns the findings and lets the caller decide.
pub fn check_duplicates(dep_files: &[DepsFile]) -> Vec<DuplicateDeclaration> {
    let map = collect_duplicate_declarations(dep_files);

    let mut duplicates: Vec<DuplicateDeclaration> = Vec::new();
    for entry in map.values() {
        if entry.locations.len() > 1 {
            let locations: Vec<DuplicateDeclarationLocation> =
                entry.locations.iter().cloned().collect();
            duplicates.push(DuplicateDeclaration {
                name: entry.name.clone(),
                locations,
            });
        }
    }

    // Sort for deterministic output.
    duplicates.sort_by(|a, b| a.name.cmp(&b.name));

    duplicates
}

/// Build the duplicate-name map by walking every dep file's AST.
fn collect_duplicate_declarations(dep_files: &[DepsFile]) -> DuplicateNameMap {
    let mut map: DuplicateNameMap = BTreeMap::new();

    for dep in dep_files {
        collect_file_duplicates(dep, &mut map);
    }

    map
}

/// Parse a single dep file and walk its top-level statements, collecting
/// declarations into `map`.
fn collect_file_duplicates(dep: &DepsFile, map: &mut DuplicateNameMap) {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(Path::new(&dep.file)).unwrap_or_default();
    let parser_return = Parser::new(&allocator, &dep.content, source_type).parse();
    let program = &parser_return.program;

    let source = &dep.content;
    let file = &dep.file;

    for stmt in &program.body {
        collect_node(stmt, source, file, &[], map);
    }
}

/// A declaration name found in a node, along with the byte offset of the
/// identifier (used to compute line/column).
struct DeclarationName {
    name: String,
    offset: u32,
}

/// Recursively collect declarations from a statement node, tracking scope.
///
/// Mirrors the TS `collectFile` function:
/// 1. Collect declaration names from the node (if it's a declaration).
/// 2. If the node introduces a scope, push its label and recurse into children
///    with the new scope stack; otherwise recurse with the same scope stack.
fn collect_node(
    stmt: &Statement,
    source: &str,
    file: &str,
    scope_stack: &[String],
    map: &mut DuplicateNameMap,
) {
    // Step 1: collect declaration names from this node.
    for decl in collect_declaration_names(stmt) {
        let scope_key = get_scope_key(file, scope_stack);
        add_duplicate_declaration(&scope_key, &decl.name, file, decl.offset, source, map);
    }

    // Step 2: recurse into children, pushing a scope label if this is a scope node.
    let scope_label = get_scope_node_label(stmt, scope_stack.len());

    if let Some(label) = scope_label {
        let mut next_stack: Vec<String> = scope_stack.to_vec();
        next_stack.push(label);
        for child in child_statements(stmt) {
            collect_node(child, source, file, &next_stack, map);
        }
    } else {
        for child in child_statements(stmt) {
            collect_node(child, source, file, scope_stack, map);
        }
    }
}

/// Collect declaration names from a statement, mirroring
/// `collectDeclarationNames` from the TS version.
fn collect_declaration_names(stmt: &Statement) -> Vec<DeclarationName> {
    match stmt {
        // Variable statements: collect each declarator's identifier name.
        Statement::VariableDeclaration(var_decl) => {
            let mut names = Vec::new();
            for declarator in &var_decl.declarations {
                if let BindingPattern::BindingIdentifier(ident) = &declarator.id {
                    names.push(DeclarationName {
                        name: ident.name.as_str().to_string(),
                        offset: ident.span.start,
                    });
                }
            }
            names
        }

        // Function declaration (named).
        Statement::FunctionDeclaration(func) => func
            .id
            .as_ref()
            .map(|id| DeclarationName {
                name: id.name.as_str().to_string(),
                offset: id.span.start,
            })
            .into_iter()
            .collect(),

        // Class declaration (named).
        Statement::ClassDeclaration(class) => class
            .id
            .as_ref()
            .map(|id| DeclarationName {
                name: id.name.as_str().to_string(),
                offset: id.span.start,
            })
            .into_iter()
            .collect(),

        // TS declarations.
        Statement::TSTypeAliasDeclaration(t) => vec![DeclarationName {
            name: t.id.name.as_str().to_string(),
            offset: t.id.span.start,
        }],
        Statement::TSInterfaceDeclaration(t) => vec![DeclarationName {
            name: t.id.name.as_str().to_string(),
            offset: t.id.span.start,
        }],
        Statement::TSEnumDeclaration(t) => vec![DeclarationName {
            name: t.id.name.as_str().to_string(),
            offset: t.id.span.start,
        }],
        Statement::TSNamespaceDeclaration(t) => vec![DeclarationName {
            name: t.id.name.as_str().to_string(),
            offset: t.id.span.start,
        }],
        Statement::TSExternalModuleDeclaration(t) => vec![DeclarationName {
            name: t.id.value.as_str().to_string(),
            offset: t.id.span.start,
        }],

        _ => Vec::new(),
    }
}

/// Compute the scope key: `file::scope1 > scope2 > ...`, or `global` if empty.
///
/// Mirrors `getScopeKey` from the TS version.
fn get_scope_key(file: &str, scope_stack: &[String]) -> String {
    if scope_stack.is_empty() {
        return "global".to_string();
    }
    format!("{file}::{}", scope_stack.join(" > "))
}

/// Determine whether a statement node introduces a scope, and if so return
/// its label. Mirrors `getScopeNodeLabel` + `isScopeNode` from the TS version.
///
/// The `index` parameter is the position of the node within its parent (used to
/// disambiguate anonymous functions/arrows/blocks).
fn get_scope_node_label(stmt: &Statement, index: usize) -> Option<String> {
    match stmt {
        // `namespace Foo {}` / `module Foo {}`
        Statement::TSNamespaceDeclaration(ns) => {
            Some(format!("namespace:{}", ns.id.name.as_str()))
        }
        Statement::TSExternalModuleDeclaration(t) => {
            Some(format!("namespace:{}", t.id.value.as_str()))
        }

        // `class Foo {}`
        Statement::ClassDeclaration(class) => Some(format!(
            "class:{}",
            class
                .id
                .as_ref()
                .map(|id| id.name.as_str().to_string())
                .unwrap_or_else(|| format!("anonymous-{index}"))
        )),

        // `function foo() {}`
        Statement::FunctionDeclaration(func) => Some(format!(
            "function:{}",
            func.id
                .as_ref()
                .map(|id| id.name.as_str().to_string())
                .unwrap_or_else(|| format!("anonymous-{index}"))
        )),

        // Expression statements may contain function expressions, arrow
        // functions, or classes that act as scope nodes.
        Statement::ExpressionStatement(expr_stmt) => {
            scope_label_from_expression(&expr_stmt.expression, index)
        }

        // Block statements introduce a scope.
        Statement::BlockStatement(_) => Some(format!("block:{index}")),

        _ => None,
    }
}

/// If an expression is a function expression, arrow function, or class, return
/// its scope label. These correspond to the TS `isFunctionExpression`,
/// `isArrowFunction`, and `isClassDeclaration` checks (when wrapped in an
/// expression statement).
fn scope_label_from_expression(expr: &Expression, index: usize) -> Option<String> {
    match expr {
        Expression::FunctionExpression(func) => Some(format!(
            "function:{}",
            func
                .id
                .as_ref()
                .map(|id| id.name.as_str().to_string())
                .unwrap_or_else(|| format!("anonymous-{index}"))
        )),
        Expression::ArrowFunctionExpression(_) => Some(format!("arrow:{index}")),
        Expression::ClassExpression(class) => Some(format!(
            "class:{}",
            class
                .id
                .as_ref()
                .map(|id| id.name.as_str().to_string())
                .unwrap_or_else(|| format!("anonymous-{index}"))
        )),
        _ => None,
    }
}

/// Return the child statements of a scope-introducing node, for recursion.
fn child_statements<'a>(stmt: &'a Statement<'a>) -> Vec<&'a Statement<'a>> {
    match stmt {
        Statement::BlockStatement(block) => block.body.iter().collect(),
        Statement::FunctionDeclaration(func) => {
            if let Some(body) = &func.body {
                function_body_statements(body)
            } else {
                Vec::new()
            }
        }
        Statement::TSNamespaceDeclaration(ns) => namespace_body_statements(&ns.body),
        Statement::TSExternalModuleDeclaration(ns) => match &ns.body {
            Some(body) => body.body.iter().collect(),
            None => Vec::new(),
        },
        Statement::ExpressionStatement(expr_stmt) => {
            expression_child_statements(&expr_stmt.expression)
        }
        Statement::ClassDeclaration(_) => {
            // Class body members are not Statements in oxc; we don't recurse
            // into class member bodies here. Top-level/class-scope duplicate
            // detection still works.
            Vec::new()
        }
        _ => Vec::new(),
    }
}

/// Get statements from a [`FunctionBody`].
fn function_body_statements<'a>(body: &'a FunctionBody<'a>) -> Vec<&'a Statement<'a>> {
    body.statements.iter().collect()
}

/// Get statements from a namespace/external-module declaration body.
fn namespace_body_statements<'a>(
    body: &'a TSNamespaceDeclarationBody<'a>,
) -> Vec<&'a Statement<'a>> {
    match body {
        TSNamespaceDeclarationBody::TSModuleBlock(block) => block.body.iter().collect(),
        TSNamespaceDeclarationBody::TSNamespaceDeclaration(_) => Vec::new(),
    }
}

/// Extract statements from a function expression / arrow / class expression
/// wrapped in an expression statement, so we can recurse into their bodies.
fn expression_child_statements<'a>(expr: &'a Expression<'a>) -> Vec<&'a Statement<'a>> {
    match expr {
        Expression::FunctionExpression(func) => {
            if let Some(body) = &func.body {
                function_body_statements(body)
            } else {
                Vec::new()
            }
        }
        Expression::ArrowFunctionExpression(arrow) => match &arrow.body {
            // Arrow function with a block body: `() => { ... }`.
            ArrowFunctionBody::FunctionBody(body) => function_body_statements(body),
            // Arrow function with an expression body: `() => expr`. The
            // remaining variants are inherited from `Expression`, none of
            // which contain statements.
            _ => Vec::new(),
        },
        Expression::ClassExpression(_) => {
            // See `child_statements`: class members aren't Statements in oxc.
            Vec::new()
        }
        _ => Vec::new(),
    }
}

/// Add a declaration to the duplicate map.
///
/// Mirrors `addDuplicateDeclaration` from the TS version. The key is
/// `scopeKey::name`. The location (file, line, column) is computed from the
/// identifier's byte offset.
fn add_duplicate_declaration(
    scope_key: &str,
    name: &str,
    file: &str,
    offset: u32,
    source: &str,
    map: &mut DuplicateNameMap,
) {
    let (line, column) = line_column_at(source, offset);
    let location = DuplicateDeclarationLocation {
        file: file.to_string(),
        line: line + 1,
        column: column + 1,
    };
    let duplicate_key = format!("{scope_key}::{name}");

    let entry = map.entry(duplicate_key).or_insert_with(|| DuplicateScopeEntry {
        name: name.to_string(),
        locations: BTreeSet::new(),
    });
    entry.locations.insert(location);
}

/// Compute the 0-based line and column (character, not byte) at a byte offset.
///
/// Mirrors `sourceFile.getLineAndCharacterOfPosition` from the TS API.
fn line_column_at(source: &str, offset: u32) -> (usize, usize) {
    let bytes = source.as_bytes();
    let mut line: usize = 0;
    let mut col: usize = 0;
    let end = (offset as usize).min(bytes.len());

    let mut i = 0;
    while i < end {
        if bytes[i] == b'\n' {
            line += 1;
            col = 0;
            i += 1;
        } else {
            // Count by char, skipping continuation bytes of multi-byte sequences.
            let byte = bytes[i];
            if byte < 0x80 || byte >= 0xC0 {
                col += 1;
            }
            i += 1;
        }
    }

    (line, col)
}