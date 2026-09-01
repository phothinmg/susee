//! TypeScript declaration (`.d.ts`) emitter.
//!
//! Generates `.d.ts` files from TypeScript source by parsing the AST and
//! extracting type information. When JSDoc annotations are present in JS
//! files, they are used to infer types that would otherwise be missing.
//!
//! # JSDoc awareness
//!
//! For JS files, a [`JSDocTypeMap`] is built from `program.comments` and
//! looked up by node start offset. Supported tags:
//! - `@returns` / `@return` → return type
//! - `@param {type} name` → parameter type
//! - `@type {type}` / `@typedef` → variable/property type
//!
//! TS files always use inline-annotation checks (JSDoc map is `None`).

use oxc::allocator::Allocator;
use oxc::parser::Parser;
use oxc::span::SourceType;

/// Emit TypeScript declaration (`.d.ts`) source from a TypeScript source string.
///
/// This function runs the oxc [`IsolatedDeclarations`] pass — the same algorithm
/// used by `tsc --isolatedDeclarations` — to produce type-only declarations that
/// describe the public surface of a module without any implementation.
///
/// # Arguments
///
/// * `source_code` — The raw TypeScript source text to generate declarations
///   from. Only `export`-ed declarations appear in the output; non-exported
///   bindings are stripped.
/// * `source_type` — The [`SourceType`] describing the module kind and language
///   variant. In practice this should be [`SourceType::ts`] (or `tsx`).
///
/// # Returns
///
/// The generated `.d.ts` content as a [`String`].
///
/// # Non-panicking
///
/// Unlike [`emit_esm`](crate::emit_esm), this function does **not** panic on
/// parse or isolated-declaration errors. Diagnostics are printed to `stderr`
/// via `eprintln!` and the best-effort output is still returned. This matches
/// the common workflow where `.d.ts` generation should not abort an entire
/// build because of a single problematic file.
///
/// # Pre-pass
///
/// Before running [`IsolatedDeclarations`], the internal
/// [`annotate_missing_return_types`] helper synthesizes missing return-type
/// annotations for functions and arrow functions so that the emitted
/// declarations never contain `declare function f();` (no return type). For
/// example:
///
/// * `function f() {}` → `function f(): void {}`
/// * `async function g() {}` → `function g(): Promise<void> {}`
/// * `const h = () => 1` → `const h: () => unknown`
///
/// When a function body is `return await foo()` (or `return foo()`) and `foo`
/// has an explicitly-annotated return type, that type is propagated to the
/// caller's synthesized annotation.
///

pub fn emit_dts(source_code: &str, source_type: SourceType) -> std::string::String {
    use oxc::codegen::Codegen;
    use oxc::isolated_declarations::{IsolatedDeclarations, IsolatedDeclarationsOptions};

    let allocator = Allocator::default();
    let mut parser_return = Parser::new(&allocator, source_code, source_type).parse();
    if !parser_return.diagnostics.is_empty() {
        let msgs: Vec<String> = parser_return
            .diagnostics
            .iter()
            .map(|e| format!("{e}"))
            .collect();
        eprintln!(
            "[warn] parse errors during .d.ts emit:\n{}",
            msgs.join("\n")
        );
    }
    // Pre-pass 1: parse JSDoc comments and apply `@returns`/`@param` type
    // annotations to functions, methods, and arrow functions. This is
    // essential for JS source (which has no TypeScript type annotations) so
    // that the generated `.d.ts` carries meaningful types instead of `unknown`.
    let jsdoc_map = collect_jsdoc_types(&allocator, &parser_return.program);

    // Pre-pass 2: fill in missing return types so IsolatedDeclarations doesn't
    // emit `declare function f();` (no return type) for async/void fns.
    annotate_missing_return_types(&allocator, &mut parser_return.program, &jsdoc_map);

    let ret = IsolatedDeclarations::new(
        &allocator,
        IsolatedDeclarationsOptions {
            strip_internal: false,
        },
    )
    .build(&parser_return.program);
    if ret.diagnostics.has_errors() {
        let msgs: Vec<String> = ret.diagnostics.iter().map(|e| format!("{e}")).collect();
        eprintln!("[warn] isolated-declaration errors:\n{}", msgs.join("\n"));
    }
    Codegen::new().build(&ret.program).code
}

/// Pre-pass that synthesizes missing return-type annotations on functions,
/// arrow functions, and class methods before [`IsolatedDeclarations`] runs.
///
/// The oxc isolated-declarations pass emits `declare function f();` (with no
/// return type) for functions that lack an explicit annotation, which is
/// invalid under `--isolatedDeclarations` (TS9007/TS9008). This helper walks
/// the program and attaches a synthetic [`TSTypeAnnotation`] to every function
/// and arrow function (including those assigned to `const`/`let`/`var`, and
/// methods/getters inside class bodies) that is missing one.
///
/// # Inference rules
///
/// | Body shape | `async` | Synthesized type |
/// |---|---|---|
/// | no `return <value>` | `false` | `void` |
/// | no `return <value>` | `true` | `Promise<void>` |
/// | `return <value>` | `false` | `any` (or propagated type) |
/// | `return <value>` | `true` | `Promise<any>` (or `Promise<T>`) |
///
/// When the function body is `return await foo()` / `return foo()` and `foo`
/// has a known explicit return type `T`, the synthesized annotation uses `T`
/// (or `Promise<T>` for async) instead of `any`. If multiple `return`
/// statements yield conflicting types, inference falls back to `any`.
///
/// # Arguments
///
/// * `allocator` — The arena allocator that owns the AST nodes. New nodes are
///   allocated in this arena so they share the same lifetime as the program.
/// * `program` — The parsed program, mutated in place.
/// * `jsdoc_map` — JSDoc type information keyed by the byte offset of the AST
///   node the JSDoc comment precedes. Used to apply `@returns`/`@param` types
///   from JSDoc comments (essential for JS source).
fn annotate_missing_return_types<'a>(
    allocator: &'a Allocator,
    program: &mut oxc::ast::ast::Program<'a>,
    jsdoc_map: &JSDocTypeMap<'a>,
) {
    use oxc::allocator::{ArenaVec, CloneIn, GetAllocator};
    use oxc::ast::ast::{
        ArrowFunctionExpression, Class, ClassElement, Declaration, ExportDefaultDeclarationKind,
        Expression, Function, MethodDefinition, MethodDefinitionKind, PropertyDefinition,
        Statement, TSType, TSTypeAnnotation, TSTypeName, TSTypeParameterInstantiation,
        VariableDeclaration, VariableDeclarator,
    };
    use oxc::ast::builder::AstBuilder;
    use oxc::span::SPAN;
    use std::collections::HashMap;

    let ast = AstBuilder::new(allocator);

    // First pass: collect a map of `name -> return type` for every function
    // (including function expressions assigned to `const`) that already has an
    // explicit return-type annotation. This lets us propagate types when a
    // function body is `return await foo();` and `foo`'s return type is known.
    let known_return_types = collect_known_return_types(&ast, program);

    for stmt in program.body.iter_mut() {
        match stmt {
            // `async function foo() {}`
            Statement::FunctionDeclaration(func) => {
                ensure_return_type(&ast, func, &known_return_types, jsdoc_map);
                let span = func.span;
                apply_jsdoc_param_types(&ast, &mut func.params, jsdoc_map, span);
                fill_untyped_params_with_any(&ast, &mut func.params);
            }
            // `export function foo() {}` / `export const foo = () => {}` /
            // `export class C { ... }`
            Statement::ExportDeclaration(exp) => match &mut exp.declaration {
                Declaration::FunctionDeclaration(func) => {
                    ensure_return_type(&ast, func, &known_return_types, jsdoc_map);
                    let span = func.span;
                    apply_jsdoc_param_types(&ast, &mut func.params, jsdoc_map, span);
                    fill_untyped_params_with_any(&ast, &mut func.params);
                }
                Declaration::VariableDeclaration(var_decl) => {
                    annotate_variable_declaration(&ast, var_decl, &known_return_types, jsdoc_map);
                }
                Declaration::ClassDeclaration(class) => {
                    annotate_class(&ast, class, &known_return_types, jsdoc_map);
                }
                _ => {}
            },
            // `export default function foo() {}` / `export default class C {}`
            Statement::ExportDefaultDeclaration(exp) => match &mut exp.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                    ensure_return_type(&ast, func, &known_return_types, jsdoc_map);
                    let span = func.span;
                    apply_jsdoc_param_types(&ast, &mut func.params, jsdoc_map, span);
                    fill_untyped_params_with_any(&ast, &mut func.params);
                }
                ExportDefaultDeclarationKind::ClassDeclaration(class) => {
                    annotate_class(&ast, class, &known_return_types, jsdoc_map);
                }
                _ => {}
            },
            // `class C {}` (top-level, non-exported)
            Statement::ClassDeclaration(class) => {
                annotate_class(&ast, class, &known_return_types, jsdoc_map);
            }
            // `const foo = () => {}` (top-level, non-exported)
            Statement::VariableDeclaration(var_decl) => {
                annotate_variable_declaration(&ast, var_decl, &known_return_types, jsdoc_map);
            }
            _ => {}
        }
    }

    /// Walk every element in a class body and synthesize missing return-type
    /// annotations on methods and getters (but not constructors or setters,
    /// which the isolated-declarations pass does not require return types for).
    /// Also annotates `PropertyDefinition`s whose initializer is a function or
    /// arrow function expression with a synthetic type annotation.
    fn annotate_class<'a>(
        ast: &AstBuilder<'a>,
        class: &mut Class<'a>,
        known: &HashMap<String, TSType<'a>>,
        jsdoc_map: &JSDocTypeMap<'a>,
    ) {
        for element in class.body.body.iter_mut() {
            match element {
                ClassElement::MethodDefinition(method) => {
                    annotate_method_definition(ast, method, known, jsdoc_map);
                }
                ClassElement::PropertyDefinition(prop) => {
                    annotate_property_definition(ast, prop, known, jsdoc_map);
                }
                _ => {}
            }
        }
    }

    /// Annotate the `Function` inside a `MethodDefinition` with a synthetic
    /// return type when it is missing. Constructors and setters don't need
    /// return type annotations, but **all** methods need parameter type
    /// annotations for `isolatedDeclarations` (TS9011), so JSDoc `@param`
    /// types are applied to every method kind, and any remaining untyped
    /// params get `any` as a fallback.
    fn annotate_method_definition<'a>(
        ast: &AstBuilder<'a>,
        method: &mut MethodDefinition<'a>,
        known: &HashMap<String, TSType<'a>>,
        jsdoc_map: &JSDocTypeMap<'a>,
    ) {
        let span = method.value.span;
        match method.kind {
            MethodDefinitionKind::Method | MethodDefinitionKind::Get => {
                ensure_return_type(ast, &mut method.value, known, jsdoc_map);
                apply_jsdoc_param_types(ast, &mut method.value.params, jsdoc_map, span);
                fill_untyped_params_with_any(ast, &mut method.value.params);
            }
            // Constructors and setters don't need return type annotations,
            // but their parameters still need type annotations.
            MethodDefinitionKind::Set | MethodDefinitionKind::Constructor => {
                apply_jsdoc_param_types(ast, &mut method.value.params, jsdoc_map, span);
                fill_untyped_params_with_any(ast, &mut method.value.params);
            }
        }
    }

    /// Annotate a `PropertyDefinition` whose `value` is a function expression or
    /// arrow function with a synthetic type annotation when it lacks one.
    fn annotate_property_definition<'a>(
        ast: &AstBuilder<'a>,
        prop: &mut PropertyDefinition<'a>,
        known: &HashMap<String, TSType<'a>>,
        jsdoc_map: &JSDocTypeMap<'a>,
    ) {
        if prop.type_annotation.is_some() {
            return;
        }
        let Some(value) = &prop.value else { return };
        let func_type = match value {
            Expression::FunctionExpression(func) => {
                build_function_type_from_function(ast, func, known, jsdoc_map, prop.span.start)
            }
            Expression::ArrowFunctionExpression(arrow) => {
                build_function_type_from_arrow(ast, arrow, known, jsdoc_map, prop.span.start)
            }
            _ => None,
        };
        if let Some(func_type) = func_type {
            prop.type_annotation = Some(TSTypeAnnotation::boxed(SPAN, func_type, ast));
        }
    }

    /// Build a return-type annotation and assign it to `func.return_type` when it
    /// is currently `None`. Uses `void`/`Promise<void>` for functions that don't
    /// return a value, or `any`/`Promise<any>` for those that do.
    /// When the function body is `return await <callee>(...)` and `<callee>` has a
    /// known explicit return type, that type is propagated.
    fn ensure_return_type<'a>(
        ast: &AstBuilder<'a>,
        func: &mut Function<'a>,
        known: &HashMap<String, TSType<'a>>,
        jsdoc_map: &JSDocTypeMap<'a>,
    ) {
        if func.return_type.is_some() {
            return;
        }
        // JSDoc `@returns {type}` takes priority over body-based inference.
        if let Some(jsdoc) = jsdoc_map.lookup(func.span.start) {
            if let Some(rt) = &jsdoc.return_type {
                let rt_type = rt.clone_in(ast.allocator());
                func.return_type = Some(TSTypeAnnotation::boxed(SPAN, rt_type, ast));
                return;
            }
            // `@returns` was present but the type didn't parse → `any`.
            if jsdoc.has_returns {
                func.return_type = Some(make_return_type_annotation(
                    ast,
                    func.r#async,
                    true,
                    Some(TSType::new_ts_any_keyword(SPAN, ast)),
                ));
                return;
            }
        }
        let has_value = function_has_return_value(func);
        let resolved = if has_value {
            infer_return_type_from_body(ast, func, known)
        } else {
            None
        };
        func.return_type = Some(make_return_type_annotation(
            ast,
            func.r#async,
            has_value,
            resolved,
        ));
    }

    /// For each declarator in a `const`/`let`/`var` whose initializer is a
    /// function expression or arrow function, synthesize a `() => void` /
    /// `() => Promise<void>` type annotation on the declarator when it lacks
    /// one so that IsolatedDeclarations doesn't emit `any` (TS9007).
    fn annotate_variable_declaration<'a>(
        ast: &AstBuilder<'a>,
        var_decl: &mut VariableDeclaration<'a>,
        known: &HashMap<String, TSType<'a>>,
        jsdoc_map: &JSDocTypeMap<'a>,
    ) {
        for declarator in var_decl.declarations.iter_mut() {
            annotate_variable_declarator(ast, declarator, known, jsdoc_map);
        }
    }

    /// Inspect a single `VariableDeclarator` and attach a synthetic function
    /// type annotation when its `init` is a function-like expression.
    fn annotate_variable_declarator<'a>(
        ast: &AstBuilder<'a>,
        declarator: &mut VariableDeclarator<'a>,
        known: &HashMap<String, TSType<'a>>,
        jsdoc_map: &JSDocTypeMap<'a>,
    ) {
        // When the initializer is a class expression, walk its body to annotate
        // methods and properties — the declarator itself doesn't need a type
        // annotation for this case.
        if let Some(Expression::ClassExpression(class)) = &mut declarator.init {
            annotate_class(ast, class, known, jsdoc_map);
            return;
        }

        if declarator.type_annotation.is_some() {
            return;
        }
        let Some(init) = &declarator.init else { return };
        let func_type = match init {
            Expression::FunctionExpression(func) => build_function_type_from_function(
                ast,
                func,
                known,
                jsdoc_map,
                declarator.span.start,
            ),
            Expression::ArrowFunctionExpression(arrow) => {
                build_function_type_from_arrow(ast, arrow, known, jsdoc_map, declarator.span.start)
            }
            // `const x = new Foo()` — extract the class name as a type
            // reference so IsolatedDeclarations doesn't emit TS9010 and fall
            // back to `unknown`.
            Expression::NewExpression(new_expr) => new_expression_type(ast, new_expr),
            _ => None,
        };
        if let Some(func_type) = func_type {
            declarator.type_annotation = Some(TSTypeAnnotation::boxed(SPAN, func_type, ast));
        }
    }

    /// Extract a [`TSType`] from a `NewExpression` callee so that
    /// `const x = new Foo()` gets the type annotation `Foo` instead of
    /// triggering TS9010 and falling back to `unknown`.
    ///
    /// Handles simple identifier callees (`new Command()`) and member
    /// expression callees (`new foo.Bar()`). For anything more complex
    /// (e.g. `(getClass())()`), returns `None` and the caller falls back
    /// to the default `any`/`unknown` behaviour.
    fn new_expression_type<'a>(
        ast: &AstBuilder<'a>,
        new_expr: &oxc::ast::ast::NewExpression<'a>,
    ) -> Option<TSType<'a>> {
        use oxc::ast::ast::{Expression, TSType, TSTypeName};
        use oxc::span::SPAN;

        match &new_expr.callee {
            // `new Command()` → `Command`
            Expression::Identifier(ident) => {
                let name = ident.name.as_str();
                if name.is_empty() {
                    return None;
                }
                let type_name = TSTypeName::new_identifier_reference(SPAN, name, ast);
                Some(TSType::new_ts_type_reference(SPAN, type_name, None, ast))
            }
            // `new foo.Bar()` → `Bar` (use the property name)
            expr => {
                let member = expr.as_member_expression()?;
                let prop_name = member.static_property_name()?;
                let type_name = TSTypeName::new_identifier_reference(SPAN, prop_name, ast);
                Some(TSType::new_ts_type_reference(SPAN, type_name, None, ast))
            }
        }
    }

    /// Build a `TSFunctionType` (`(params) => Promise<void>` / `(params) => void`)
    /// from a `Function` expression, reusing its parameter list and synthesizing
    /// the return type when missing.
    fn build_function_type_from_function<'a>(
        ast: &AstBuilder<'a>,
        func: &Function<'a>,
        known: &HashMap<String, TSType<'a>>,
        jsdoc_map: &JSDocTypeMap<'a>,
        owner_span: u32,
    ) -> Option<TSType<'a>> {
        let has_value = function_has_return_value(func);
        let jsdoc = jsdoc_map.lookup(owner_span);
        let jsdoc_rt = jsdoc
            .and_then(|j| j.return_type.as_ref())
            .map(|rt| rt.clone_in(ast.allocator()));
        let jsdoc_has_returns = jsdoc.is_some_and(|j| j.has_returns);
        let resolved = if has_value {
            infer_return_type_from_body(ast, func, known)
        } else {
            None
        };
        let return_type = func
            .return_type
            .as_ref()
            .map(|rt| rt.clone_in(ast.allocator()))
            .unwrap_or_else(|| {
                if let Some(jrt) = jsdoc_rt {
                    TSTypeAnnotation::boxed(SPAN, jrt, ast)
                } else if jsdoc_has_returns {
                    // `@returns` present but type didn't parse → `any`.
                    make_return_type_annotation(
                        ast,
                        func.r#async,
                        true,
                        Some(TSType::new_ts_any_keyword(SPAN, ast)),
                    )
                } else {
                    make_return_type_annotation(ast, func.r#async, has_value, resolved)
                }
            });
        let mut params = func.params.clone_in(ast.allocator());
        // Apply JSDoc @param types and fill remaining untyped params with `any`.
        apply_jsdoc_param_types(
            ast,
            &mut params,
            jsdoc_map,
            oxc::span::Span::new(owner_span, owner_span),
        );
        fill_untyped_params_with_any(ast, &mut params);
        let type_params = func
            .type_parameters
            .as_ref()
            .map(|tp| tp.clone_in(ast.allocator()));
        let this_param = func
            .this_param
            .as_ref()
            .map(|tp| tp.clone_in(ast.allocator()));
        Some(TSType::new_ts_function_type(
            SPAN,
            type_params,
            this_param,
            params,
            return_type,
            ast,
        ))
    }

    /// Build a `TSFunctionType` from an `ArrowFunctionExpression`, reusing its
    /// parameter list and synthesizing the return type when missing.
    fn build_function_type_from_arrow<'a>(
        ast: &AstBuilder<'a>,
        arrow: &ArrowFunctionExpression<'a>,
        known: &HashMap<String, TSType<'a>>,
        jsdoc_map: &JSDocTypeMap<'a>,
        owner_span: u32,
    ) -> Option<TSType<'a>> {
        let has_value = arrow_has_return_value(arrow);
        let jsdoc = jsdoc_map.lookup(owner_span);
        let jsdoc_rt = jsdoc
            .and_then(|j| j.return_type.as_ref())
            .map(|rt| rt.clone_in(ast.allocator()));
        let jsdoc_has_returns = jsdoc.is_some_and(|j| j.has_returns);
        let resolved = if has_value {
            infer_return_type_from_arrow_body(ast, arrow, known)
        } else {
            None
        };
        let return_type = arrow
            .return_type
            .as_ref()
            .map(|rt| rt.clone_in(ast.allocator()))
            .unwrap_or_else(|| {
                if let Some(jrt) = jsdoc_rt {
                    TSTypeAnnotation::boxed(SPAN, jrt, ast)
                } else if jsdoc_has_returns {
                    // `@returns` present but type didn't parse → `any`.
                    make_return_type_annotation(
                        ast,
                        arrow.r#async,
                        true,
                        Some(TSType::new_ts_any_keyword(SPAN, ast)),
                    )
                } else {
                    make_return_type_annotation(ast, arrow.r#async, has_value, resolved)
                }
            });
        let mut params = arrow.params.clone_in(ast.allocator());
        // Apply JSDoc @param types and fill remaining untyped params with `any`.
        apply_jsdoc_param_types(
            ast,
            &mut params,
            jsdoc_map,
            oxc::span::Span::new(owner_span, owner_span),
        );
        fill_untyped_params_with_any(ast, &mut params);
        let type_params = arrow
            .type_parameters
            .as_ref()
            .map(|tp| tp.clone_in(ast.allocator()));
        Some(TSType::new_ts_function_type(
            SPAN,
            type_params,
            None,
            params,
            return_type,
            ast,
        ))
    }

    /// Construct the `TSTypeAnnotation` box for the synthetic return type.
    /// When `has_return_value` is true, `any`/`Promise<any>` is used instead
    /// of `void`/`Promise<void>` so the annotation does not lie about functions that
    /// actually return a value.
    fn make_return_type_annotation<'a>(
        ast: &AstBuilder<'a>,
        is_async: bool,
        has_return_value: bool,
        resolved: Option<TSType<'a>>,
    ) -> oxc::allocator::Box<'a, TSTypeAnnotation<'a>> {
        // Prefer a resolved type when available; otherwise fall back to `any`
        // (for functions that return a value) or `void` (for those that don't).
        let inner_type = if let Some(rt) = resolved {
            rt
        } else if has_return_value {
            TSType::new_ts_any_keyword(SPAN, ast)
        } else {
            TSType::new_ts_void_keyword(SPAN, ast)
        };
        let type_annotation = if is_async {
            // `Promise<T>` where T is the resolved type, `any`, or `void`.
            let mut params: ArenaVec<'a, TSType<'a>> = ArenaVec::with_capacity_in(1, ast);
            params.push(inner_type);
            let type_args = TSTypeParameterInstantiation::boxed(SPAN, params, ast);
            let promise_name = TSTypeName::new_identifier_reference(SPAN, "Promise", ast);
            TSType::new_ts_type_reference(SPAN, promise_name, Some(type_args), ast)
        } else {
            inner_type
        };
        TSTypeAnnotation::boxed(SPAN, type_annotation, ast)
    }

    /// Recursively walk a slice of statements looking for any `return <value>;`.
    /// Returns inside nested function/arrow bodies are not counted.
    fn has_return_with_value(statements: &[Statement<'_>]) -> bool {
        fn check(stmt: &Statement<'_>) -> bool {
            match stmt {
                Statement::ReturnStatement(ret) => ret.argument.is_some(),
                Statement::BlockStatement(block) => block.body.iter().any(check),
                Statement::IfStatement(if_stmt) => {
                    check(&if_stmt.consequent) || if_stmt.alternate.as_ref().is_some_and(check)
                }
                Statement::ForStatement(for_stmt) => check(&for_stmt.body),
                Statement::ForInStatement(for_in) => check(&for_in.body),
                Statement::ForOfStatement(for_of) => check(&for_of.body),
                Statement::WhileStatement(while_stmt) => check(&while_stmt.body),
                Statement::DoWhileStatement(do_while) => check(&do_while.body),
                Statement::LabeledStatement(labeled) => check(&labeled.body),
                Statement::WithStatement(with_stmt) => check(&with_stmt.body),
                Statement::TryStatement(try_stmt) => {
                    try_stmt.block.body.iter().any(check)
                        || try_stmt
                            .handler
                            .as_ref()
                            .is_some_and(|h| h.body.body.iter().any(check))
                        || try_stmt
                            .finalizer
                            .as_ref()
                            .is_some_and(|f| f.body.iter().any(check))
                }
                Statement::SwitchStatement(switch) => switch
                    .cases
                    .iter()
                    .any(|case| case.consequent.iter().any(check)),
                _ => false,
            }
        }
        statements.iter().any(check)
    }

    /// Check if a `Function` has any `return <value>;` in its body.
    fn function_has_return_value(func: &Function<'_>) -> bool {
        func.body
            .as_ref()
            .is_some_and(|body| has_return_with_value(&body.statements))
    }

    /// Check if an `ArrowFunctionExpression` returns a value.
    /// Expression-body arrows always return a value; block-body arrows are checked.
    fn arrow_has_return_value(arrow: &ArrowFunctionExpression<'_>) -> bool {
        if arrow.body.is_function_body() {
            arrow
                .body
                .as_function_body()
                .is_some_and(|body| has_return_with_value(&body.statements))
        } else {
            // Expression body — always returns a value.
            true
        }
    }

    /// First pass over the whole program: collect every top-level function or
    /// `const fn = (...) => ...` whose return type is *explicitly* annotated and
    /// record `name -> TSType`. Only `TSType` (not `Box<TSTypeAnnotation>`) is
    /// stored so it can be cheaply cloned into the arena later.
    fn collect_known_return_types<'a>(
        ast: &AstBuilder<'a>,
        program: &oxc::ast::ast::Program<'a>,
    ) -> HashMap<String, TSType<'a>> {
        let mut map = HashMap::new();
        for stmt in &program.body {
            match stmt {
                // `function foo(): T {}`
                Statement::FunctionDeclaration(func) => {
                    if let (Some(name), Some(rt)) = (func.name(), &func.return_type) {
                        map.insert(
                            name.as_str().to_string(),
                            rt.type_annotation.clone_in(ast.allocator()),
                        );
                    }
                }
                // `export function foo(): T {}` / `export class C {}` /
                // `export const foo = ...`
                Statement::ExportDeclaration(exp) => match &exp.declaration {
                    Declaration::FunctionDeclaration(func) => {
                        if let (Some(name), Some(rt)) = (func.name(), &func.return_type) {
                            map.insert(
                                name.as_str().to_string(),
                                rt.type_annotation.clone_in(ast.allocator()),
                            );
                        }
                    }
                    Declaration::VariableDeclaration(var_decl) => {
                        collect_var_decls(ast, var_decl, &mut map);
                    }
                    Declaration::ClassDeclaration(class) => {
                        collect_class_methods(ast, class, &mut map);
                    }
                    _ => {}
                },
                // `class C {}` (non-exported)
                Statement::ClassDeclaration(class) => {
                    collect_class_methods(ast, class, &mut map);
                }
                // `const foo = ...;` (non-exported)
                Statement::VariableDeclaration(var_decl) => {
                    collect_var_decls(ast, var_decl, &mut map);
                }
                _ => {}
            }
        }
        map
    }

    /// Collect known return types from methods in a class body. Method names
    /// are recorded so that `return this.foo()` patterns could be resolved in a
    /// future extension; for now only the class name itself is collected if the
    /// class has an explicit return type (which classes don't, so this is a
    /// no-op placeholder for future `this.method()` inference).
    fn collect_class_methods<'a>(
        ast: &AstBuilder<'a>,
        class: &Class<'a>,
        map: &mut HashMap<String, TSType<'a>>,
    ) {
        // Class methods are not collected by name into the known-return-types
        // map because they are accessed via `this.method()`, not as free
        // identifiers. This is a placeholder for future `this.method()` return
        // type inference if needed.
        let _ = (ast, class, map);
    }

    /// Helper: record known return types from a `const`/`let`/`var` declaration.
    fn collect_var_decls<'a>(
        ast: &AstBuilder<'a>,
        var_decl: &VariableDeclaration<'a>,
        map: &mut HashMap<String, TSType<'a>>,
    ) {
        use oxc::ast::ast::BindingPattern;
        for decl in &var_decl.declarations {
            let name = match &decl.id {
                BindingPattern::BindingIdentifier(bi) => bi.name.as_str().to_string(),
                _ => continue,
            };
            // Case A: the declarator has an explicit type annotation.
            if let Some(ann) = &decl.type_annotation {
                map.insert(name, ann.type_annotation.clone_in(ast.allocator()));
                continue;
            }
            // Case B: the initializer is a function with an explicit return type.
            if let Some(init) = &decl.init {
                let rt = match init {
                    Expression::FunctionExpression(f) => f.return_type.as_ref(),
                    Expression::ArrowFunctionExpression(a) => a.return_type.as_ref(),
                    _ => None,
                };
                if let Some(rt) = rt {
                    map.insert(name, rt.type_annotation.clone_in(ast.allocator()));
                }
            }
        }
    }

    /// Try to infer the return type of a `Function` by inspecting its `return`
    /// statements. Currently handles the common pattern `return await foo();`
    /// (and `return foo();`) where `foo` has a known return type.
    fn infer_return_type_from_body<'a>(
        ast: &AstBuilder<'a>,
        func: &Function<'a>,
        known: &HashMap<String, TSType<'a>>,
    ) -> Option<TSType<'a>> {
        let body = func.body.as_ref()?;
        let mut candidate: Option<TSType<'a>> = None;
        for ret in find_return_arguments(&body.statements) {
            {
                let t = resolve_expression_type(ast, ret, known, func.r#async)?;
                // Keep the first resolved type; if subsequent returns disagree we
                // bail out and fall back to `any`.
                if let Some(existing) = &candidate {
                    if !type_content_eq(existing, &t) {
                        return None;
                    }
                } else {
                    candidate = Some(t);
                }
            }
        }
        candidate
    }

    /// Same as [`infer_return_type_from_body`] but for arrow functions.
    fn infer_return_type_from_arrow_body<'a>(
        ast: &AstBuilder<'a>,
        arrow: &ArrowFunctionExpression<'a>,
        known: &HashMap<String, TSType<'a>>,
    ) -> Option<TSType<'a>> {
        if arrow.body.is_function_body() {
            let body = arrow.body.as_function_body()?;
            let mut candidate: Option<TSType<'a>> = None;
            for ret in find_return_arguments(&body.statements) {
                {
                    let t = resolve_expression_type(ast, ret, known, arrow.r#async)?;
                    if let Some(existing) = &candidate {
                        if !type_content_eq(existing, &t) {
                            return None;
                        }
                    } else {
                        candidate = Some(t);
                    }
                }
            }
            candidate
        } else {
            // Expression body: the body *is* the return value.
            let expr = arrow.body.as_expression()?;
            resolve_expression_type(ast, expr, known, arrow.r#async)
        }
    }

    /// Resolve the *value* type of an expression that appears in `return`.
    /// Handles `await foo()` (unwraps `Promise<T>` -> `T`), plain `foo()`
    /// (uses the callee's return type directly), and bare identifiers whose
    /// declared type is known.
    fn resolve_expression_type<'a>(
        ast: &AstBuilder<'a>,
        expr: &Expression<'a>,
        known: &HashMap<String, TSType<'a>>,
        _is_async: bool,
    ) -> Option<TSType<'a>> {
        match expr {
            // `return await foo();` — unwrap the Promise.
            Expression::AwaitExpression(await_expr) => {
                let inner = resolve_expression_type(ast, &await_expr.argument, known, true)?;
                unwrap_promise(ast, inner)
            }
            // `return foo();`
            Expression::CallExpression(call) => {
                let callee_name = call.callee_name()?;
                let rt = known.get(callee_name)?;
                Some(rt.clone_in(ast.allocator()))
            }
            // `return foo;` where `foo` has a known type.
            Expression::Identifier(ident) => {
                let name = ident.name.as_str();
                known.get(name).map(|t| t.clone_in(ast.allocator()))
            }
            // Unsupported expression shape.
            _ => None,
        }
    }

    /// If `ty` is `Promise<T>`, return `T`; otherwise return `ty` unchanged.
    fn unwrap_promise<'a>(ast: &AstBuilder<'a>, ty: TSType<'a>) -> Option<TSType<'a>> {
        if let TSType::TSTypeReference(reference) = &ty
            && let TSTypeName::IdentifierReference(ident) = &reference.type_name
            && ident.name.as_str() == "Promise"
            && let Some(type_args) = &reference.type_arguments
            && type_args.params.len() == 1
        {
            return Some(type_args.params[0].clone_in(ast.allocator()));
        }
        Some(ty)
    }

    /// Collect every `return <expr>;` argument in a statement list, recursing
    /// through control-flow constructs but **not** into nested function bodies.
    fn find_return_arguments<'a, 's>(statements: &'s [Statement<'a>]) -> Vec<&'s Expression<'a>> {
        let mut out = Vec::new();
        fn walk<'a, 's>(stmt: &'s Statement<'a>, out: &mut Vec<&'s Expression<'a>>) {
            match stmt {
                Statement::ReturnStatement(ret) => {
                    if let Some(arg) = &ret.argument {
                        out.push(arg);
                    }
                }
                Statement::BlockStatement(block) => block.body.iter().for_each(|s| walk(s, out)),
                Statement::IfStatement(if_stmt) => {
                    walk(&if_stmt.consequent, out);
                    if let Some(alt) = &if_stmt.alternate {
                        walk(alt, out);
                    }
                }
                Statement::ForStatement(f) => walk(&f.body, out),
                Statement::ForInStatement(f) => walk(&f.body, out),
                Statement::ForOfStatement(f) => walk(&f.body, out),
                Statement::WhileStatement(w) => walk(&w.body, out),
                Statement::DoWhileStatement(d) => walk(&d.body, out),
                Statement::LabeledStatement(l) => walk(&l.body, out),
                Statement::WithStatement(w) => walk(&w.body, out),
                Statement::TryStatement(t) => {
                    t.block.body.iter().for_each(|s| walk(s, out));
                    if let Some(h) = &t.handler {
                        h.body.body.iter().for_each(|s| walk(s, out));
                    }
                    if let Some(f) = &t.finalizer {
                        f.body.iter().for_each(|s| walk(s, out));
                    }
                }
                Statement::SwitchStatement(s) => {
                    for case in &s.cases {
                        case.consequent.iter().for_each(|c| walk(c, out));
                    }
                }
                _ => {}
            }
        }
        for stmt in statements {
            walk(stmt, &mut out);
        }
        out
    }

    /// Structural equality check for `TSType` by comparing generated source.
    fn type_content_eq(a: &TSType<'_>, b: &TSType<'_>) -> bool {
        use oxc::codegen::{Codegen, Context, Gen as GenTrait};
        let mut ca = Codegen::new();
        a.print(&mut ca, Context::empty());
        let sa = ca.into_source_text();
        let mut cb = Codegen::new();
        b.print(&mut cb, Context::empty());
        let sb = cb.into_source_text();
        sa == sb
    }
}

// ─── JSDoc type extraction ─────────────────────────────────────────────

/// JSDoc type information extracted from a `/** ... */` comment, keyed by the
/// byte offset of the AST node the comment precedes.
///
/// `return_type` holds the parsed `@returns {type}` / `@return {type}` type.
/// `has_returns` is `true` when a `@returns`/`@return` tag was present even if
/// the type expression failed to parse (so the caller can fall back to `any`
/// instead of body-based inference).
/// `params` maps parameter names to their parsed `@param {type} name` types.
/// `param_any_names` lists params whose `@param` tag was present but whose
/// type expression failed to parse (so the caller can assign `any`).
pub(crate) struct JSDocInfo<'a> {
    pub return_type: Option<oxc::ast::ast::TSType<'a>>,
    pub has_returns: bool,
    pub params: std::collections::HashMap<String, oxc::ast::ast::TSType<'a>>,
    pub param_any_names: Vec<String>,
}

/// A map from the **start byte offset** of an AST node to the JSDoc info
/// extracted from the `/** ... */` comment that immediately precedes it.
///
/// Comments are stored sorted by their end offset so that [`lookup`] can
/// binary-search for the comment whose end is closest to (and before) the
/// given node start offset.
pub(crate) struct JSDocTypeMap<'a> {
    /// `(comment_end_offset, JSDocInfo)` pairs, sorted by `comment_end_offset`.
    entries: Vec<(u32, JSDocInfo<'a>)>,
}

impl<'a> JSDocTypeMap<'a> {
    /// Look up JSDoc info for an AST node whose span starts at `node_start`.
    ///
    /// The comment must end at or before `node_start`, and the gap between the
    /// comment end and the node start must be small (only whitespace). This
    /// prevents matching a JSDoc comment that belongs to a different node.
    pub fn lookup(&self, node_start: u32) -> Option<&JSDocInfo<'a>> {
        // Binary search for the rightmost entry whose end <= node_start.
        let idx = self.entries.partition_point(|(end, _)| *end <= node_start);
        if idx == 0 {
            return None;
        }
        let (comment_end, info) = &self.entries[idx - 1];
        // Only accept if the comment ends close to the node start (within 64
        // bytes of whitespace/newlines). This prevents matching a JSDoc comment
        // that belongs to a different, earlier node when there's code in between.
        if *comment_end <= node_start && node_start - *comment_end <= 64 {
            Some(info)
        } else {
            None
        }
    }
}

/// Walk `program.comments`, identify JSDoc comments, parse `@returns`/`@param`
/// type expressions, and build a [`JSDocTypeMap`] keyed by node start offsets.
fn collect_jsdoc_types<'a>(
    allocator: &'a Allocator,
    program: &oxc::ast::ast::Program<'a>,
) -> JSDocTypeMap<'a> {
    use oxc::ast::builder::AstBuilder;

    let ast = AstBuilder::new(allocator);
    let source_text = program.source_text;
    let mut entries: Vec<(u32, JSDocInfo<'a>)> = Vec::new();

    for comment in &program.comments {
        // Only JSDoc comments start with `/**`.
        let comment_text: &'a str =
            &source_text[comment.span.start as usize..comment.span.end as usize];
        if !comment_text.starts_with("/**") {
            continue;
        }
        // Extract the inner content (between `/**` and `*/`).
        let inner: &'a str = &comment_text[3..comment_text.len().saturating_sub(2)];
        let info = parse_jsdoc_comment(&ast, inner);
        if info.return_type.is_some()
            || info.has_returns
            || !info.params.is_empty()
            || !info.param_any_names.is_empty()
        {
            entries.push((comment.span.end, info));
        }
    }

    entries.sort_by_key(|(end, _)| *end);
    JSDocTypeMap { entries }
}

/// Parse the inner content of a `/** ... */` JSDoc comment and extract
/// `@returns {type}` and `@param {type} name` type annotations.
fn parse_jsdoc_comment<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    inner: &'a str,
) -> JSDocInfo<'a> {
    use oxc::ast::ast::TSType;
    let mut return_type: Option<TSType<'a>> = None;
    let mut has_returns = false;
    let mut params: std::collections::HashMap<String, TSType<'a>> =
        std::collections::HashMap::new();
    let mut param_any_names: Vec<String> = Vec::new();

    // Process line by line. JSDoc tags start with `@` at the beginning of a
    // line (after stripping leading `* `).
    for raw_line in inner.lines() {
        let line = raw_line.trim().trim_start_matches('*').trim();
        if line.starts_with("@returns") || line.starts_with("@return") {
            has_returns = true;
            // Extract the type expression in `{...}`.
            if let Some(ty_str) = extract_braced_type(line)
                && let Some(ty) = parse_jsdoc_type(ast, ty_str)
            {
                return_type = Some(ty);
            }
            // If parse failed, return_type stays None → caller uses `any`.
            // If no `{...}` braces, return_type stays None → caller uses `any`.
        } else if line.starts_with("@param") {
            // `@param {type} name` or `@param {type} [name]` or `@param name`
            if let Some(ty_str) = extract_braced_type(line) {
                // Extract the parameter name after the `}`.
                let after_brace = find_after_brace(line);
                if let Some(name) = extract_param_name(after_brace) {
                    if let Some(ty) = parse_jsdoc_type(ast, ty_str) {
                        params.insert(name.clone(), ty);
                    } else {
                        // @param present with a type that failed to parse → `any`.
                        param_any_names.push(name);
                    }
                }
            }
        }
    }

    JSDocInfo {
        return_type,
        has_returns,
        params,
        param_any_names,
    }
}

/// Extract the content inside the first `{...}` in a string.
/// Returns the inner text (without braces) as a slice of the input.
fn extract_braced_type(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let end = s[start..].find('}')? + start;
    Some(s[start + 1..end].trim())
}

/// Find the text after the closing `}` of the first `{...}` group.
fn find_after_brace(s: &str) -> &str {
    if let Some(start) = s.find('{')
        && let Some(end) = s[start..].find('}')
    {
        return s[start + end + 1..].trim();
    }
    s
}

/// Extract a parameter name from text like `name`, `[name]`, `name=default`.
fn extract_param_name(s: &str) -> Option<String> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    // Handle `[name]` (optional) — strip a leading `[` and the matching `]`.
    let s = if let Some(inner) = s.strip_prefix('[') {
        if let Some(end) = inner.find(']') {
            &inner[..end]
        } else {
            s
        }
    } else {
        s
    };
    // Take up to `=` or whitespace.
    let name = s.split(|c: char| c == '=' || c.is_whitespace()).next()?;
    let name = name.trim();
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

/// Parse a JSDoc type expression string into an oxc [`TSType`] node.
///
/// Supports the common JSDoc type expressions:
/// - Primitive keywords: `string`, `number`, `boolean`, `void`, `null`,
///   `undefined`, `any`, `unknown`, `never`, `object`, `symbol`, `bigint`
/// - Array shorthand: `type[]`, `type[][]`
/// - Union: `type1|type2`
/// - Type references: `Promise`, `Map`, custom type names
/// - Generic type args: `Promise<string>`, `Map<string, number>`
/// - Parenthesized: `(type1|type2)[]`
fn parse_jsdoc_type<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    type_str: &'a str,
) -> Option<oxc::ast::ast::TSType<'a>> {
    let trimmed = type_str.trim();
    if trimmed.is_empty() {
        return None;
    }
    parse_jsdoc_type_inner(ast, trimmed)
}

/// Inner recursive parser for JSDoc type expressions.
fn parse_jsdoc_type_inner<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    type_str: &'a str,
) -> Option<oxc::ast::ast::TSType<'a>> {
    use oxc::allocator::ArenaVec;
    use oxc::ast::ast::{TSType, TSTypeName, TSTypeParameterInstantiation};
    use oxc::span::SPAN;

    let trimmed = type_str.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Check for trailing `[]` (array type) — but not `[][]` which we handle
    // recursively. We need to be careful not to split on `[]` inside `<>`.
    // Find the last `[]` that is not inside angle brackets.
    if let Some(array_inner) = strip_trailing_array(trimmed) {
        let inner_type = parse_jsdoc_type_inner(ast, array_inner)?;
        return Some(TSType::new_ts_array_type(SPAN, inner_type, ast));
    }

    // Check for union `|` at the top level (not inside `<>` or `()`).
    if let Some(union_parts) = split_top_level_union(trimmed)
        && union_parts.len() > 1
    {
        let mut types: ArenaVec<'a, TSType<'a>> =
            ArenaVec::with_capacity_in(union_parts.len(), ast);
        for part in &union_parts {
            if let Some(t) = parse_jsdoc_type_inner(ast, part) {
                types.push(t);
            }
        }
        if !types.is_empty() {
            return Some(TSType::new_ts_union_type(SPAN, types, ast));
        }
    }

    // Check for parenthesized type `(type)`.
    if trimmed.starts_with('(') && trimmed.ends_with(')') {
        // Make sure the parens are balanced and match the whole expression.
        if is_balanced_parens(trimmed) {
            let inner = &trimmed[1..trimmed.len() - 1];
            let inner_type = parse_jsdoc_type_inner(ast, inner)?;
            return Some(TSType::new_ts_parenthesized_type(SPAN, inner_type, ast));
        }
    }

    // Check for generic type args: `Name<arg1, arg2, ...>`.
    if let Some(lt_pos) = find_top_level_lt(trimmed)
        && trimmed.ends_with('>')
    {
        let name_str = trimmed[..lt_pos].trim();
        let args_str = &trimmed[lt_pos + 1..trimmed.len() - 1];
        let type_name = TSTypeName::new_identifier_reference(SPAN, name_str, ast);
        let arg_strs = split_top_level_commas(args_str);
        let mut params: ArenaVec<'a, TSType<'a>> = ArenaVec::with_capacity_in(arg_strs.len(), ast);
        for arg in &arg_strs {
            if let Some(t) = parse_jsdoc_type_inner(ast, arg) {
                params.push(t);
            }
        }
        if !params.is_empty() {
            let type_args = TSTypeParameterInstantiation::boxed(SPAN, params, ast);
            return Some(TSType::new_ts_type_reference(
                SPAN,
                type_name,
                Some(type_args),
                ast,
            ));
        }
    }

    // Primitive keywords.
    match trimmed {
        "string" => return Some(TSType::new_ts_string_keyword(SPAN, ast)),
        "number" => return Some(TSType::new_ts_number_keyword(SPAN, ast)),
        "boolean" | "bool" => return Some(TSType::new_ts_boolean_keyword(SPAN, ast)),
        "void" => return Some(TSType::new_ts_void_keyword(SPAN, ast)),
        "null" => return Some(TSType::new_ts_null_keyword(SPAN, ast)),
        "undefined" => return Some(TSType::new_ts_undefined_keyword(SPAN, ast)),
        "any" => return Some(TSType::new_ts_any_keyword(SPAN, ast)),
        "unknown" => return Some(TSType::new_ts_unknown_keyword(SPAN, ast)),
        "never" => return Some(TSType::new_ts_never_keyword(SPAN, ast)),
        "object" => return Some(TSType::new_ts_object_keyword(SPAN, ast)),
        "symbol" => return Some(TSType::new_ts_symbol_keyword(SPAN, ast)),
        "bigint" | "BigInt" => return Some(TSType::new_ts_big_int_keyword(SPAN, ast)),
        "Function" => {
            // `Function` in JSDoc → `(...args: any[]) => any` roughly, but we
            // simplify to `Function` type reference.
            let name = TSTypeName::new_identifier_reference(SPAN, "Function", ast);
            return Some(TSType::new_ts_type_reference(SPAN, name, None, ast));
        }
        "*" => return Some(TSType::new_ts_any_keyword(SPAN, ast)),
        _ => {}
    }

    // Otherwise it's a type reference (e.g., `Promise`, `Map`, `Command`).
    // Validate that it's a valid identifier (starts with letter/`_`/`$`).
    if trimmed
        .chars()
        .next()
        .is_some_and(|c| c.is_alphabetic() || c == '_' || c == '$')
    {
        let type_name = TSTypeName::new_identifier_reference(SPAN, trimmed, ast);
        // Some well-known generic types are invalid without type arguments
        // (e.g. `Promise` requires `Promise<T>`). When a JSDoc type expression
        // references one of them bare (no `<>`), fill in `any` so the emitted
        // `.d.ts` is valid TypeScript.
        let needs_type_arg = matches!(
            trimmed,
            "Promise"
                | "Map"
                | "Set"
                | "WeakMap"
                | "WeakSet"
                | "Array"
                | "ReadonlyArray"
                | "ReadonlyMap"
                | "ReadonlySet"
                | "Iterable"
                | "IterableIterator"
                | "Iterator"
                | "AsyncIterable"
                | "AsyncIterator"
                | "Generator"
                | "AsyncGenerator"
                | "PromiseLike"
        );
        if needs_type_arg {
            let mut params: ArenaVec<'a, TSType<'a>> = ArenaVec::with_capacity_in(1, ast);
            params.push(TSType::new_ts_any_keyword(SPAN, ast));
            let type_args = TSTypeParameterInstantiation::boxed(SPAN, params, ast);
            return Some(TSType::new_ts_type_reference(
                SPAN,
                type_name,
                Some(type_args),
                ast,
            ));
        }
        return Some(TSType::new_ts_type_reference(SPAN, type_name, None, ast));
    }

    None
}

/// Strip a trailing `[]` from a type string, accounting for nested brackets.
/// Returns the inner type string if `[]` was stripped.
fn strip_trailing_array(s: &str) -> Option<&str> {
    if !s.ends_with("[]") {
        return None;
    }
    // Make sure the `[]` is not inside angle brackets.
    let without_brackets = &s[..s.len() - 2];
    let depth_lt = without_brackets.chars().filter(|&c| c == '<').count();
    let depth_gt = without_brackets.chars().filter(|&c| c == '>').count();
    if depth_lt != depth_gt {
        return None;
    }
    Some(without_brackets)
}

/// Split a type string on top-level `|` characters (not inside `<>` or `()`).
fn split_top_level_union(s: &str) -> Option<Vec<&str>> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    let mut found_pipe = false;
    for (i, c) in s.char_indices() {
        match c {
            '<' | '(' => depth += 1,
            '>' | ')' => depth -= 1,
            '|' if depth == 0 => {
                found_pipe = true;
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&s[start..]);
    if found_pipe { Some(parts) } else { None }
}

/// Split a type string on top-level `,` characters (not inside `<>` or `()`).
fn split_top_level_commas(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    for (i, c) in s.char_indices() {
        match c {
            '<' | '(' | '[' | '{' => depth += 1,
            '>' | ')' | ']' | '}' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&s[start..]);
    parts
}

/// Find the position of the top-level `<` in a type string (for generic args).
fn find_top_level_lt(s: &str) -> Option<usize> {
    let mut depth = 0i32;
    for (i, c) in s.char_indices() {
        match c {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            '<' if depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

/// Check if parentheses are balanced in a string.
fn is_balanced_parens(s: &str) -> bool {
    let mut depth = 0i32;
    for c in s.chars() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            _ => {}
        }
    }
    depth == 0
}

/// Apply JSDoc `@param {type} name` annotations to the formal parameters of
/// a function. Only parameters that don't already have a type annotation are
/// annotated. When `@param` was present but the type expression failed to
/// parse, the parameter gets `any`.
fn apply_jsdoc_param_types<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    params: &mut oxc::allocator::Box<'a, oxc::ast::ast::FormalParameters<'a>>,
    jsdoc_map: &JSDocTypeMap<'a>,
    owner_span: oxc::span::Span,
) {
    use oxc::allocator::{CloneIn, GetAllocator};
    use oxc::ast::ast::{BindingPattern, TSType, TSTypeAnnotation};
    use oxc::span::SPAN;

    let Some(jsdoc) = jsdoc_map.lookup(owner_span.start) else {
        return;
    };
    if jsdoc.params.is_empty() && jsdoc.param_any_names.is_empty() {
        return;
    }

    for param in params.items.iter_mut() {
        // Skip if the parameter already has a type annotation.
        if param.type_annotation.is_some() {
            continue;
        }
        // Get the parameter name (only simple identifier params are supported).
        let name = match &param.pattern {
            BindingPattern::BindingIdentifier(bi) => bi.name.as_str().to_string(),
            _ => continue,
        };
        if let Some(ty) = jsdoc.params.get(&name) {
            let ty_clone = ty.clone_in(ast.allocator());
            param.type_annotation = Some(TSTypeAnnotation::boxed(SPAN, ty_clone, ast));
        } else if jsdoc.param_any_names.iter().any(|n| n == &name) {
            // `@param` was present but type didn't parse → `any`.
            let any_type = TSType::new_ts_any_keyword(SPAN, ast);
            param.type_annotation = Some(TSTypeAnnotation::boxed(SPAN, any_type, ast));
        }
    }
}

/// Fill any remaining untyped parameters with `any` so that
/// `isolatedDeclarations` doesn't emit TS9011 errors. This is essential for
/// JS source where parameters have no TypeScript annotations and may not
/// have JSDoc `@param` tags either.
fn fill_untyped_params_with_any<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    params: &mut oxc::allocator::Box<'a, oxc::ast::ast::FormalParameters<'a>>,
) {
    use oxc::ast::ast::{TSType, TSTypeAnnotation};
    use oxc::span::SPAN;

    for param in params.items.iter_mut() {
        if param.type_annotation.is_some() {
            continue;
        }
        let any_type = TSType::new_ts_any_keyword(SPAN, ast);
        param.type_annotation = Some(TSTypeAnnotation::boxed(SPAN, any_type, ast));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─── Basic declaration generation ──────────────────────────────────

    /// An `export const` should become `export declare const`.
    #[test]
    fn emits_exported_const() {
        let out = emit_dts("export const x = 42;", SourceType::ts());
        assert!(out.contains("export declare const x"), "got: {out}");
    }

    /// Function implementations are replaced with `declare function` stubs.
    #[test]
    fn emits_exported_function() {
        let out = emit_dts("export function foo() {}", SourceType::ts());
        assert!(out.contains("export declare function foo"), "got: {out}");
    }

    /// Function bodies (implementations) must be stripped from the .d.ts.
    #[test]
    fn strips_function_body() {
        let out = emit_dts(
            "export function add(a: number, b: number): number { return a + b; }",
            SourceType::ts(),
        );
        assert!(out.contains("export declare function add"), "got: {out}");
        assert!(
            !out.contains("return a + b"),
            "body should be stripped, got: {out}"
        );
    }

    /// An explicit return-type annotation should be preserved verbatim.
    #[test]
    fn preserves_explicit_return_type() {
        let out = emit_dts(
            "export function bar(): number { return 1; }",
            SourceType::ts(),
        );
        assert!(out.contains("bar(): number"), "got: {out}");
    }

    // ─── Synthetic return-type inference ───────────────────────────────

    /// A void function with no explicit return type gets `: void`.
    #[test]
    fn synthesizes_void_for_empty_function() {
        let out = emit_dts("export function foo() {}", SourceType::ts());
        assert!(out.contains("foo(): void"), "got: {out}");
    }

    /// An async void function gets `: Promise<void>`.
    #[test]
    fn synthesizes_promise_void_for_async_function() {
        let out = emit_dts("export async function baz() {}", SourceType::ts());
        assert!(out.contains("baz(): Promise<void>"), "got: {out}");
    }

    /// A function returning a value but with no explicit type gets `: any`.
    #[test]
    fn synthesizes_any_for_returning_function() {
        let out = emit_dts("export function foo() { return 1; }", SourceType::ts());
        assert!(out.contains("foo(): any"), "got: {out}");
    }

    /// An async function returning a value gets `: Promise<any>`.
    #[test]
    fn synthesizes_promise_any_for_async_returning() {
        let out = emit_dts(
            "export async function foo() { return 1; }",
            SourceType::ts(),
        );
        assert!(out.contains("foo(): Promise<any>"), "got: {out}");
    }

    /// A function whose body is `return f()` where `f` has a known return type
    /// should have that type propagated.
    #[test]
    fn propagates_return_type_from_callee() {
        let src = "function f(): number { return 1; }\nexport function useF() { return f(); }";
        let out = emit_dts(src, SourceType::ts());
        assert!(out.contains("useF(): number"), "got: {out}");
    }

    /// A function whose body is `return await f()` where `f` returns `Promise<T>`
    /// should get `Promise<T>` (the Promise is unwrapped for await, then re-wrapped).
    #[test]
    fn propagates_return_type_from_awaited_callee() {
        let src = "function f(): Promise<number> { return Promise.resolve(1); }\nexport async function useF() { return await f(); }";
        let out = emit_dts(src, SourceType::ts());
        assert!(out.contains("useF(): Promise<number>"), "got: {out}");
    }

    /// An arrow function assigned to `const` gets a `TSFunctionType` annotation.
    #[test]
    fn annotates_arrow_const() {
        let out = emit_dts("export const fn = (a: number) => a + 1;", SourceType::ts());
        assert!(out.contains("export declare const fn"), "got: {out}");
        // The synthesized type should include the parameter and `any` return.
        assert!(out.contains("(a: number)"), "got: {out}");
        assert!(out.contains("any"), "got: {out}");
    }

    // ─── Type-level constructs ─────────────────────────────────────────

    /// Interfaces are preserved as-is in .d.ts output.
    #[test]
    fn preserves_interface() {
        let out = emit_dts("export interface I { a: string; }", SourceType::ts());
        assert!(out.contains("export interface I"), "got: {out}");
        assert!(out.contains("a: string"), "got: {out}");
    }

    /// Type aliases are preserved as-is in .d.ts output.
    #[test]
    fn preserves_type_alias() {
        let out = emit_dts("export type T = string | number;", SourceType::ts());
        assert!(out.contains("export type T"), "got: {out}");
        assert!(out.contains("string | number"), "got: {out}");
    }

    /// Classes become `declare class` with method signatures (no bodies).
    #[test]
    fn emits_declare_class() {
        let out = emit_dts("export class C { m(): void {} }", SourceType::ts());
        assert!(out.contains("export declare class C"), "got: {out}");
        assert!(out.contains("m(): void"), "got: {out}");
        assert!(
            !out.contains("{}"),
            "method body should be stripped, got: {out}"
        );
    }

    /// Enums become `declare enum` with their computed values.
    #[test]
    fn emits_declare_enum() {
        let out = emit_dts("export enum E { A, B }", SourceType::ts());
        assert!(out.contains("export declare enum E"), "got: {out}");
        assert!(out.contains("A = 0"), "got: {out}");
        assert!(out.contains("B = 1"), "got: {out}");
    }

    // ─── Visibility and non-exported code ──────────────────────────────

    /// Non-exported bindings should be stripped from .d.ts output.
    #[test]
    fn strips_non_exported_bindings() {
        let src = "const internal = 1;\nexport const pub = 2;";
        let out = emit_dts(src, SourceType::ts());
        assert!(out.contains("export declare const pub"), "got: {out}");
        assert!(
            !out.contains("internal"),
            "non-exported binding should be stripped, got: {out}"
        );
    }

    /// A default export function should appear in the output.
    #[test]
    fn emits_default_export() {
        let out = emit_dts("export default function def(): void {}", SourceType::ts());
        assert!(out.contains("export default"), "got: {out}");
        assert!(out.contains("function def"), "got: {out}");
    }

    // ─── Edge cases ────────────────────────────────────────────────────

    /// An empty source should produce empty (or whitespace-only) output.
    #[test]
    fn handles_empty_source() {
        let out = emit_dts("", SourceType::ts());
        assert!(out.trim().is_empty(), "expected empty output, got: {out}");
    }

    /// Verify the function returns a [`String`].
    #[test]
    fn returns_string_type() {
        let out = emit_dts("export const x = 1;", SourceType::ts());
        let _: String = out;
    }

    /// TSX source should also work for .d.ts generation.
    #[test]
    fn handles_tsx_source() {
        let out = emit_dts(
            "export function Component(): JSX.Element { return <div/>; }",
            SourceType::tsx(),
        );
        assert!(
            out.contains("export declare function Component"),
            "got: {out}"
        );
    }

    /// A function with parameters should preserve parameter types in the output.
    #[test]
    fn preserves_parameter_types() {
        let out = emit_dts(
            "export function greet(name: string, age?: number): string { return name; }",
            SourceType::ts(),
        );
        assert!(out.contains("name: string"), "got: {out}");
        assert!(out.contains("age"), "got: {out}");
        assert!(out.contains(": string"), "got: {out}");
    }

    /// Generics on exported functions should be preserved.
    #[test]
    fn preserves_generics() {
        let out = emit_dts(
            "export function identity<T>(value: T): T { return value; }",
            SourceType::ts(),
        );
        assert!(out.contains("<T>"), "got: {out}");
        assert!(out.contains("T"), "got: {out}");
    }

    // ─── Class method return types (JS and TS) ──────────────────────────

    /// A class method with no return value gets `: void` in the .d.ts output.
    #[test]
    fn synthesizes_void_for_class_method_no_return() {
        let out = emit_dts(
            "export class C { method() { console.log('hi'); } }",
            SourceType::ts(),
        );
        assert!(out.contains("method(): void"), "got: {out}");
    }

    /// An async class method with no return value gets `: Promise<void>`.
    #[test]
    fn synthesizes_promise_void_for_async_class_method() {
        let out = emit_dts("export class C { async method() {} }", SourceType::ts());
        assert!(out.contains("method(): Promise<void>"), "got: {out}");
    }

    /// A class method that returns a value gets `: any`.
    #[test]
    fn synthesizes_any_for_class_method_returning() {
        let out = emit_dts(
            "export class C { method() { return 1; } }",
            SourceType::ts(),
        );
        assert!(out.contains("method(): any"), "got: {out}");
    }

    /// An async class method that returns a value gets `: Promise<any>`.
    #[test]
    fn synthesizes_promise_any_for_async_class_method_returning() {
        let out = emit_dts(
            "export class C { async method() { return 1; } }",
            SourceType::ts(),
        );
        assert!(out.contains("method(): Promise<any>"), "got: {out}");
    }

    /// A class getter with no explicit return type gets `: any`.
    #[test]
    fn synthesizes_any_for_class_getter() {
        let out = emit_dts(
            "export class C { get value() { return 42; } }",
            SourceType::ts(),
        );
        assert!(out.contains("get value(): any"), "got: {out}");
    }

    /// A class constructor does not get a return type annotation.
    #[test]
    fn constructor_has_no_return_type() {
        let out = emit_dts(
            "export class C { constructor(x: number) {} }",
            SourceType::ts(),
        );
        assert!(out.contains("constructor"), "got: {out}");
        // Constructor should not have a return type annotation.
        assert!(
            !out.contains("constructor():"),
            "constructor should not have return type, got: {out}"
        );
    }

    /// A class setter does not get a return type annotation.
    #[test]
    fn setter_has_no_return_type() {
        let out = emit_dts(
            "export class C { get value(): number { return 1; } set value(v: number) { this._v = v; } }",
            SourceType::ts(),
        );
        assert!(out.contains("set value"), "got: {out}");
        // Setter should not have a return type annotation.
        assert!(
            !out.contains("set value():"),
            "setter should not have return type, got: {out}"
        );
    }

    /// A class property initialized with an arrow function gets a function type.
    #[test]
    fn annotates_class_property_arrow() {
        let out = emit_dts(
            "export class C { handler = (a: number) => a + 1; }",
            SourceType::ts(),
        );
        assert!(out.contains("handler"), "got: {out}");
        assert!(out.contains("(a: number)"), "got: {out}");
        assert!(out.contains("any"), "got: {out}");
    }

    /// A class method with an explicit return type is preserved verbatim.
    #[test]
    fn preserves_explicit_class_method_return_type() {
        let out = emit_dts(
            "export class C { method(): string { return 'hi'; } }",
            SourceType::ts(),
        );
        assert!(out.contains("method(): string"), "got: {out}");
    }

    /// A class expression assigned to `const` — the IsolatedDeclarations pass
    /// does not support inference from class expressions (TS9022), so the
    /// output is `declare const C: unknown`. Our pre-pass still walks the class
    /// body to annotate methods (which are stripped along with the class), so
    /// this test verifies the pre-pass doesn't crash.
    #[test]
    fn handles_class_expression_in_const() {
        let out = emit_dts("export const C = class { method() {} };", SourceType::ts());
        // IsolatedDeclarations can't infer from class expressions, so it falls
        // back to `unknown`.
        assert!(out.contains("export declare const C"), "got: {out}");
    }

    /// A non-exported class still gets method annotations (even though it's
    /// stripped from the output, the pre-pass should not crash).
    #[test]
    fn handles_non_exported_class() {
        let out = emit_dts(
            "class Internal { method() {} }\nexport const pub = 2;",
            SourceType::ts(),
        );
        assert!(out.contains("export declare const pub"), "got: {out}");
        assert!(
            !out.contains("Internal"),
            "non-exported class should be stripped, got: {out}"
        );
    }

    /// A default-exported class gets method annotations.
    #[test]
    fn annotates_default_export_class() {
        let out = emit_dts("export default class C { method() {} }", SourceType::ts());
        assert!(out.contains("method(): void"), "got: {out}");
    }

    // ─── JS source .d.ts generation ─────────────────────────────────────

    /// JS source functions should get return types in .d.ts output.
    #[test]
    fn js_function_gets_return_type() {
        let out = emit_dts("export function foo() {}", SourceType::mjs());
        assert!(out.contains("foo(): void"), "got: {out}");
    }

    /// JS source async functions should get `Promise<void>`.
    #[test]
    fn js_async_function_gets_promise_void() {
        let out = emit_dts("export async function foo() {}", SourceType::mjs());
        assert!(out.contains("foo(): Promise<void>"), "got: {out}");
    }

    /// JS source class methods should get return types.
    #[test]
    fn js_class_method_gets_return_type() {
        let out = emit_dts(
            "export class C { method() { console.log('hi'); } }",
            SourceType::mjs(),
        );
        assert!(out.contains("method(): void"), "got: {out}");
    }

    /// JS source class async methods should get `Promise<any>`.
    #[test]
    fn js_class_async_method_gets_return_type() {
        let out = emit_dts(
            "export class C { async method() { return 1; } }",
            SourceType::mjs(),
        );
        assert!(out.contains("method(): Promise<any>"), "got: {out}");
    }

    /// JS source class getters should get return types.
    #[test]
    fn js_class_getter_gets_return_type() {
        let out = emit_dts(
            "export class C { get value() { return 42; } }",
            SourceType::mjs(),
        );
        assert!(out.contains("get value(): any"), "got: {out}");
    }

    /// JS source arrow function assigned to const should get a type annotation.
    #[test]
    fn js_arrow_const_gets_type() {
        let out = emit_dts("export const fn = (a) => a + 1;", SourceType::mjs());
        assert!(out.contains("export declare const fn"), "got: {out}");
        assert!(out.contains("any"), "got: {out}");
    }

    /// JS source class with arrow function property should get a type annotation.
    #[test]
    fn js_class_arrow_property_gets_type() {
        let out = emit_dts(
            "export class C { handler = () => { return 1; }; }",
            SourceType::mjs(),
        );
        assert!(out.contains("handler"), "got: {out}");
        assert!(out.contains("any"), "got: {out}");
    }

    /// JS source with JSDoc `@param` and `@returns` annotations should have
    /// those types reflected in the generated `.d.ts`.
    #[test]
    fn js_jsdoc_param_and_returns() {
        let src = r#"
/**
 * Add two numbers.
 * @param {number} a - First number.
 * @param {number} b - Second number.
 * @returns {number} The sum.
 */
export function add(a, b) {
  return a + b;
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("a: number"), "got: {out}");
        assert!(out.contains("b: number"), "got: {out}");
        assert!(out.contains("): number"), "got: {out}");
    }

    /// JSDoc `@returns {string}` on a class method.
    #[test]
    fn js_jsdoc_class_method_returns() {
        let src = r#"
export class C {
  /**
   * @param {string} name - The name.
   * @returns {string} A greeting.
   */
  greet(name) {
    return 'hi ' + name;
  }
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("greet(name: string): string"), "got: {out}");
    }

    /// JSDoc `@returns {void}` on an async function → `Promise<void>`.
    #[test]
    fn js_jsdoc_async_void_returns() {
        let src = r#"
/**
 * @returns {Promise<void>}
 */
export async function delay() {}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("delay(): Promise<void>"), "got: {out}");
    }

    /// JSDoc array type `string[]`.
    #[test]
    fn js_jsdoc_array_type() {
        let src = r#"
/**
 * @returns {string[]}
 */
export function getNames() {
  return ['a', 'b'];
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("string[]"), "got: {out}");
    }

    /// JSDoc union type `string | number`.
    #[test]
    fn js_jsdoc_union_type() {
        let src = r#"
/**
 * @returns {string | number}
 */
export function getValue() {
  return 42;
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("string | number"), "got: {out}");
    }

    /// JSDoc generic type `Promise<string>`.
    #[test]
    fn js_jsdoc_generic_type() {
        let src = r#"
/**
 * @returns {Promise<string>}
 */
export function fetchName() {
  return Promise.resolve('hi');
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("Promise<string>"), "got: {out}");
    }

    /// JSDoc `@param` with optional `[name]` syntax.
    #[test]
    fn js_jsdoc_optional_param() {
        let src = r#"
/**
 * @param {string} [name] - Optional name.
 * @returns {string}
 */
export function greet(name) {
  return name || 'world';
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("name: string"), "got: {out}");
        assert!(out.contains("): string"), "got: {out}");
    }

    // ─── Fallback to `any` ─────────────────────────────────────────────

    /// A JS function with no JSDoc and no return type gets `: any` (not
    /// `unknown`) when it returns a value.
    #[test]
    fn js_no_jsdoc_returning_gets_any() {
        let out = emit_dts("export function foo() { return 1; }", SourceType::mjs());
        assert!(out.contains("foo(): any"), "got: {out}");
        assert!(!out.contains("unknown"), "got: {out}");
    }

    /// A JS async function with no JSDoc gets `: Promise<any>`.
    #[test]
    fn js_no_jsdoc_async_returning_gets_promise_any() {
        let out = emit_dts(
            "export async function foo() { return 1; }",
            SourceType::mjs(),
        );
        assert!(out.contains("foo(): Promise<any>"), "got: {out}");
        assert!(!out.contains("unknown"), "got: {out}");
    }

    /// JSDoc `@returns` without a `{type}` expression → `: any`.
    #[test]
    fn js_jsdoc_returns_without_type_gets_any() {
        let src = r#"
/**
 * @returns The computed value.
 */
export function compute() {
  return 42;
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("compute(): any"), "got: {out}");
        assert!(!out.contains("unknown"), "got: {out}");
    }

    /// JSDoc `@returns {InvalidType}` where the type expression fails to
    /// parse → `: any`.
    #[test]
    fn js_jsdoc_returns_invalid_type_gets_any() {
        let src = r#"
/**
 * @returns {???}
 */
export function compute() {
  return 42;
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("compute(): any"), "got: {out}");
    }

    /// JSDoc `@param {???} name` where the type expression fails to parse
    /// → param gets `: any`.
    #[test]
    fn js_jsdoc_param_invalid_type_gets_any() {
        let src = r#"
/**
 * @param {???} value
 * @returns {void}
 */
export function process(value) {}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("process(value: any): void"), "got: {out}");
    }

    /// JSDoc `@param` without a `{type}` (just a name) → param gets `: any`.
    #[test]
    fn js_jsdoc_param_without_type_gets_any() {
        let src = r#"
/**
 * @param value - The value to process.
 * @returns {void}
 */
export function process(value) {}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("process(value: any): void"), "got: {out}");
    }

    /// A JS class method with no JSDoc that returns a value gets `: any`.
    #[test]
    fn js_class_method_no_jsdoc_gets_any() {
        let out = emit_dts(
            "export class C { method() { return 1; } }",
            SourceType::mjs(),
        );
        assert!(out.contains("method(): any"), "got: {out}");
        assert!(!out.contains("unknown"), "got: {out}");
    }

    /// A JS class method with a JSDoc comment that has `@package` but no
    /// `@returns` should still get `: any` (not `unknown`) when it returns a
    /// value.
    #[test]
    fn js_jsdoc_package_only_no_returns_gets_any() {
        let src = r#"
export class C {
  /**
   * @package
   */
  _concatValue(value, previous) {
    if (previous === this.defaultValue) {
      return [value];
    }
    return previous.concat(value);
  }
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(
            out.contains("_concatValue(value: any, previous: any): any"),
            "got: {out}"
        );
        assert!(!out.contains("unknown"), "got: {out}");
    }

    /// JSDoc `@return {Promise}` without type args should become `Promise<any>`,
    /// not a bare invalid `Promise`.
    #[test]
    fn js_jsdoc_bare_promise_gets_promise_any() {
        let src = r#"
/**
 * @return {Promise}
 */
export function delay() {
  return Promise.resolve(1);
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("Promise<any>"), "got: {out}");
        assert!(
            !out.contains("): Promise;"),
            "bare Promise is invalid, got: {out}"
        );
    }

    /// JSDoc `@return {Map}` without type args should become `Map<any, any>`.
    #[test]
    fn js_jsdoc_bare_map_gets_map_any_any() {
        let src = r#"
/**
 * @return {Map}
 */
export function getMap() {
  return new Map();
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("Map<any"), "got: {out}");
        assert!(!out.contains("): Map;"), "bare Map is invalid, got: {out}");
    }

    /// JSDoc `@return {Promise<string>}` should stay as `Promise<string>`.
    #[test]
    fn js_jsdoc_promise_with_arg_preserved() {
        let src = r#"
/**
 * @return {Promise<string>}
 */
export function fetchName() {
  return Promise.resolve('hi');
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("Promise<string>"), "got: {out}");
    }

    // ─── NewExpression type inference (TS9010 fix) ─────────────────────

    /// `export const program = new Command()` should get type `Command`,
    /// not `unknown` or trigger TS9010.
    #[test]
    fn new_expression_gets_callee_type() {
        let src = r#"
class Command {}
export const program = new Command();
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(
            out.contains("export declare const program: Command"),
            "got: {out}"
        );
        assert!(!out.contains("unknown"), "got: {out}");
    }

    /// `export const x = new Foo.Bar()` should get type `Bar`.
    #[test]
    fn new_expression_member_callee_gets_property_type() {
        let src = r#"
class Bar {}
const Foo = { Bar };
export const x = new Foo.Bar();
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("export declare const x: Bar"), "got: {out}");
    }
}
