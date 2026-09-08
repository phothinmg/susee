// cspell: disable
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
/// # Example
///
/// ```
/// use susee::emit_dts;
/// use oxc::span::SourceType;
///
/// let src = "export function add(a: number, b: number): number { return a + b; }";
/// let out = emit_dts(src, SourceType::ts());
/// assert!(out.contains("export declare function add"));
/// assert!(out.contains("number"));
/// // Implementation bodies are stripped.
/// assert!(!out.contains("return a + b"));
/// ```
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
    // Pre-pass for JS sources: extract types from JSDoc comments (e.g.
    // `@param {string} name`, `@returns {number}`) and attach them as
    // TypeScript annotations. Any parameter or return type without a JSDoc
    // annotation is set to `any`. This must run *before*
    // `annotate_missing_return_types` so that JSDoc-derived return types are
    // respected and the `any` fallback for missing annotations takes effect.
    if source_type.is_javascript() {
        annotate_jsdoc_types(&allocator, &mut parser_return.program, source_code);
    }

    // Pre-pass: fill in missing return types so IsolatedDeclarations doesn't
    // emit `declare function f();` (no return type) for async/void fns.
    annotate_missing_return_types(&allocator, &mut parser_return.program);

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
/// | `return <value>` | `false` | `unknown` (or propagated type) |
/// | `return <value>` | `true` | `Promise<unknown>` (or `Promise<T>`) |
///
/// When the function body is `return await foo()` / `return foo()` and `foo`
/// has a known explicit return type `T`, the synthesized annotation uses `T`
/// (or `Promise<T>` for async) instead of `unknown`. If multiple `return`
/// statements yield conflicting types, inference falls back to `unknown`.
///
/// # Arguments
///
/// * `allocator` — The arena allocator that owns the AST nodes. New nodes are
///   allocated in this arena so they share the same lifetime as the program.
/// * `program` — The parsed program, mutated in place.
fn annotate_missing_return_types<'a>(
    allocator: &'a Allocator,
    program: &mut oxc::ast::ast::Program<'a>,
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
                ensure_return_type(&ast, func, &known_return_types);
            }
            // `export function foo() {}` / `export const foo = () => {}` /
            // `export class C { ... }`
            Statement::ExportDeclaration(exp) => match &mut exp.declaration {
                Declaration::FunctionDeclaration(func) => {
                    ensure_return_type(&ast, func, &known_return_types);
                }
                Declaration::VariableDeclaration(var_decl) => {
                    annotate_variable_declaration(&ast, var_decl, &known_return_types);
                }
                Declaration::ClassDeclaration(class) => {
                    annotate_class(&ast, &mut **class, &known_return_types);
                }
                _ => {}
            },
            // `export default function foo() {}` / `export default class C {}`
            Statement::ExportDefaultDeclaration(exp) => match &mut exp.declaration {
                ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                    ensure_return_type(&ast, func, &known_return_types);
                }
                ExportDefaultDeclarationKind::ClassDeclaration(class) => {
                    annotate_class(&ast, &mut **class, &known_return_types);
                }
                _ => {}
            },
            // `class C {}` (top-level, non-exported)
            Statement::ClassDeclaration(class) => {
                annotate_class(&ast, &mut **class, &known_return_types);
            }
            // `const foo = () => {}` (top-level, non-exported)
            Statement::VariableDeclaration(var_decl) => {
                annotate_variable_declaration(&ast, var_decl, &known_return_types);
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
    ) {
        for element in class.body.body.iter_mut() {
            match element {
                ClassElement::MethodDefinition(method) => {
                    annotate_method_definition(ast, method, known);
                }
                ClassElement::PropertyDefinition(prop) => {
                    annotate_property_definition(ast, prop, known);
                }
                _ => {}
            }
        }
    }

    /// Annotate the `Function` inside a `MethodDefinition` with a synthetic
    /// return type when it is missing. Constructors and setters are skipped
    /// because the isolated-declarations pass does not require return types
    /// for them.
    fn annotate_method_definition<'a>(
        ast: &AstBuilder<'a>,
        method: &mut MethodDefinition<'a>,
        known: &HashMap<String, TSType<'a>>,
    ) {
        match method.kind {
            MethodDefinitionKind::Method | MethodDefinitionKind::Get => {
                ensure_return_type(ast, &mut method.value, known);
            }
            // Constructors and setters don't need return type annotations.
            MethodDefinitionKind::Set | MethodDefinitionKind::Constructor => {}
        }
    }

    /// Annotate a `PropertyDefinition` whose `value` is a function expression or
    /// arrow function with a synthetic type annotation when it lacks one.
    fn annotate_property_definition<'a>(
        ast: &AstBuilder<'a>,
        prop: &mut PropertyDefinition<'a>,
        known: &HashMap<String, TSType<'a>>,
    ) {
        if prop.type_annotation.is_some() {
            return;
        }
        let Some(value) = &prop.value else { return };
        let func_type = match value {
            Expression::FunctionExpression(func) => {
                build_function_type_from_function(ast, func, known)
            }
            Expression::ArrowFunctionExpression(arrow) => {
                build_function_type_from_arrow(ast, arrow, known)
            }
            _ => None,
        };
        if let Some(func_type) = func_type {
            prop.type_annotation = Some(TSTypeAnnotation::boxed(SPAN, func_type, ast));
        }
    }

    /// Build a return-type annotation and assign it to `func.return_type` when it
    /// is currently `None`. Uses `void`/`Promise<void>` for functions that don't
    /// return a value, or `unknown`/`Promise<unknown>` for those that do.
    /// When the function body is `return await <callee>(...)` and `<callee>` has a
    /// known explicit return type, that type is propagated.
    fn ensure_return_type<'a>(
        ast: &AstBuilder<'a>,
        func: &mut Function<'a>,
        known: &HashMap<String, TSType<'a>>,
    ) {
        if func.return_type.is_some() {
            return;
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
    /// one so that IsolatedDeclarations doesn't emit `unknown` (TS9007).
    fn annotate_variable_declaration<'a>(
        ast: &AstBuilder<'a>,
        var_decl: &mut VariableDeclaration<'a>,
        known: &HashMap<String, TSType<'a>>,
    ) {
        for declarator in var_decl.declarations.iter_mut() {
            annotate_variable_declarator(ast, declarator, known);
        }
    }

    /// Inspect a single `VariableDeclarator` and attach a synthetic function
    /// type annotation when its `init` is a function-like expression.
    fn annotate_variable_declarator<'a>(
        ast: &AstBuilder<'a>,
        declarator: &mut VariableDeclarator<'a>,
        known: &HashMap<String, TSType<'a>>,
    ) {
        // When the initializer is a class expression, walk its body to annotate
        // methods and properties — the declarator itself doesn't need a type
        // annotation for this case.
        if let Some(Expression::ClassExpression(class)) = &mut declarator.init {
            annotate_class(ast, &mut **class, known);
            return;
        }

        if declarator.type_annotation.is_some() {
            return;
        }
        let Some(init) = &declarator.init else { return };
        let func_type = match init {
            Expression::FunctionExpression(func) => {
                build_function_type_from_function(ast, func, known)
            }
            Expression::ArrowFunctionExpression(arrow) => {
                build_function_type_from_arrow(ast, arrow, known)
            }
            _ => None,
        };
        if let Some(func_type) = func_type {
            declarator.type_annotation = Some(TSTypeAnnotation::boxed(SPAN, func_type, ast));
        }
    }

    /// Build a `TSFunctionType` (`(params) => Promise<void>` / `(params) => void`)
    /// from a `Function` expression, reusing its parameter list and synthesizing
    /// the return type when missing.
    fn build_function_type_from_function<'a>(
        ast: &AstBuilder<'a>,
        func: &Function<'a>,
        known: &HashMap<String, TSType<'a>>,
    ) -> Option<TSType<'a>> {
        let has_value = function_has_return_value(func);
        let resolved = if has_value {
            infer_return_type_from_body(ast, func, known)
        } else {
            None
        };
        let return_type = func
            .return_type
            .as_ref()
            .map(|rt| rt.clone_in(ast.allocator()))
            .unwrap_or_else(|| make_return_type_annotation(ast, func.r#async, has_value, resolved));
        let params = func.params.clone_in(ast.allocator());
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
    ) -> Option<TSType<'a>> {
        let has_value = arrow_has_return_value(arrow);
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
                make_return_type_annotation(ast, arrow.r#async, has_value, resolved)
            });
        let params = arrow.params.clone_in(ast.allocator());
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
    /// When `has_return_value` is true, `unknown`/`Promise<unknown>` is used instead
    /// of `void`/`Promise<void>` so the annotation does not lie about functions that
    /// actually return a value.
    fn make_return_type_annotation<'a>(
        ast: &AstBuilder<'a>,
        is_async: bool,
        has_return_value: bool,
        resolved: Option<TSType<'a>>,
    ) -> oxc::allocator::Box<'a, TSTypeAnnotation<'a>> {
        // Prefer a resolved type when available; otherwise fall back to `unknown`
        // (for functions that return a value) or `void` (for those that don't).
        let inner_type = if let Some(rt) = resolved {
            rt
        } else if has_return_value {
            TSType::new_ts_unknown_keyword(SPAN, ast)
        } else {
            TSType::new_ts_void_keyword(SPAN, ast)
        };
        let type_annotation = if is_async {
            // `Promise<T>` where T is the resolved type, `unknown`, or `void`.
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
            if let Some(t) = resolve_expression_type(ast, ret, known, func.r#async) {
                // Keep the first resolved type; if subsequent returns disagree we
                // bail out and fall back to `unknown`.
                if let Some(existing) = &candidate {
                    if !type_content_eq(existing, &t) {
                        return None;
                    }
                } else {
                    candidate = Some(t);
                }
            } else {
                // Unknown return — can't safely infer, bail.
                return None;
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
                if let Some(t) = resolve_expression_type(ast, ret, known, arrow.r#async) {
                    if let Some(existing) = &candidate {
                        if !type_content_eq(existing, &t) {
                            return None;
                        }
                    } else {
                        candidate = Some(t);
                    }
                } else {
                    return None;
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
        if let TSType::TSTypeReference(reference) = &ty {
            if let TSTypeName::IdentifierReference(ident) = &reference.type_name {
                if ident.name.as_str() == "Promise" {
                    if let Some(type_args) = &reference.type_arguments {
                        if type_args.params.len() == 1 {
                            return Some(type_args.params[0].clone_in(ast.allocator()));
                        }
                    }
                }
            }
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

// ---------------------------------------------------------------------------
// JSDoc → TypeScript type annotation pre-pass (JS sources only)
// ---------------------------------------------------------------------------

/// Parsed JSDoc tag for a single parameter or the return value.
#[derive(Debug)]
struct JSDocTag {
    /// Parameter name (from `@param {Type} name`). `None` for `@returns`.
    param_name: Option<String>,
    /// The type expression text between `{` and `}`, e.g. `"string"`.
    type_text: Option<String>,
}

/// Parsed JSDoc information for a function/method.
#[derive(Debug, Default)]
struct JSDocInfo {
    /// `@param` tags, in order.
    params: Vec<JSDocTag>,
    /// `@returns` / `@return` tag.
    returns: Option<JSDocTag>,
}

/// Pre-pass for JavaScript sources: extracts type information from JSDoc
/// comments and attaches it as TypeScript annotations on function parameters
/// and return types. Any parameter or return type that lacks a JSDoc
/// annotation is set to `any`.
///
/// This pass handles:
///
/// * Top-level function declarations (exported and non-exported).
/// * `export default function` declarations.
/// * `const`/`let`/`var` declarations whose initializer is a function or arrow
///   expression.
/// * Class methods (regular methods, getters) and class property definitions
///   whose value is a function or arrow expression.
/// * Arrow function expressions assigned to `const`/`let`/`var`.
///
/// JSDoc tags recognized:
///
/// * `@param {Type} name` — sets the parameter `name`'s type annotation.
/// * `@param {Type} name.description` — dotted names for object destructuring.
/// * `@returns {Type}` / `@return {Type}` — sets the return type annotation.
///
/// Parameters not mentioned in any `@param` tag and functions without a
/// `@returns` tag get `any`.
fn annotate_jsdoc_types<'a>(
    allocator: &'a Allocator,
    program: &mut oxc::ast::ast::Program<'a>,
    source_text: &str,
) {
    use oxc::ast::ast::{
        ArrowFunctionExpression, Class, ClassElement, Declaration, ExportDefaultDeclarationKind,
        Expression, Function, MethodDefinitionKind, PropertyDefinition, Statement,
        VariableDeclaration, VariableDeclarator,
    };
    use oxc::ast::builder::AstBuilder;
    use oxc::span::SPAN;

    let ast = AstBuilder::new(allocator);

    for stmt in program.body.iter_mut() {
        match stmt {
            Statement::FunctionDeclaration(func) => {
                let span_start = func.span.start;
                let jsdoc = find_jsdoc_for_span(&program.comments, span_start, source_text);
                annotate_function_jsdoc(&ast, func, &jsdoc);
            }
            Statement::ExportDeclaration(exp) => {
                let span_start = exp.span.start;
                match &mut exp.declaration {
                    Declaration::FunctionDeclaration(func) => {
                        let jsdoc = find_jsdoc_for_span(&program.comments, span_start, source_text);
                        annotate_function_jsdoc(&ast, func, &jsdoc);
                    }
                    Declaration::VariableDeclaration(var_decl) => {
                        annotate_variable_jsdoc(
                            &ast,
                            var_decl,
                            &program.comments,
                            source_text,
                            span_start,
                        );
                    }
                    Declaration::ClassDeclaration(class) => {
                        annotate_class_jsdoc(
                            &ast,
                            &mut **class,
                            &program.comments,
                            source_text,
                            span_start,
                        );
                    }
                    _ => {}
                }
            }
            Statement::ExportDefaultDeclaration(exp) => {
                let span_start = exp.span.start;
                match &mut exp.declaration {
                    ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                        let jsdoc = find_jsdoc_for_span(&program.comments, span_start, source_text);
                        annotate_function_jsdoc(&ast, func, &jsdoc);
                    }
                    ExportDefaultDeclarationKind::ClassDeclaration(class) => {
                        annotate_class_jsdoc(
                            &ast,
                            &mut **class,
                            &program.comments,
                            source_text,
                            span_start,
                        );
                    }
                    _ => {}
                }
            }
            Statement::ClassDeclaration(class) => {
                let span_start = class.span.start;
                annotate_class_jsdoc(
                    &ast,
                    &mut **class,
                    &program.comments,
                    source_text,
                    span_start,
                );
            }
            Statement::VariableDeclaration(var_decl) => {
                let span_start = var_decl.span.start;
                annotate_variable_jsdoc(&ast, var_decl, &program.comments, source_text, span_start);
            }
            _ => {}
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /// Annotate a `Function` from JSDoc: set parameter types and return type.
    /// Parameters and return type not covered by JSDoc get `any`.
    fn annotate_function_jsdoc<'a>(
        ast: &AstBuilder<'a>,
        func: &mut Function<'a>,
        jsdoc: &JSDocInfo,
    ) {
        annotate_params_jsdoc(ast, &mut func.params, jsdoc);
        if func.return_type.is_none() {
            if let Some(ret) = &jsdoc.returns {
                if let Some(type_text) = &ret.type_text {
                    if let Some(tsty) = parse_jsdoc_type(ast, type_text) {
                        func.return_type =
                            Some(oxc::ast::ast::TSTypeAnnotation::boxed(SPAN, tsty, ast));
                    }
                }
            }
            // If still no return type (no JSDoc @returns or failed to parse),
            // fall back to `any`.
            if func.return_type.is_none() {
                func.return_type = Some(oxc::ast::ast::TSTypeAnnotation::boxed(
                    SPAN,
                    oxc::ast::ast::TSType::new_ts_any_keyword(SPAN, ast),
                    ast,
                ));
            }
        }
    }

    /// Annotate an `ArrowFunctionExpression` from JSDoc.
    fn annotate_arrow_jsdoc<'a>(
        ast: &AstBuilder<'a>,
        arrow: &mut ArrowFunctionExpression<'a>,
        jsdoc: &JSDocInfo,
    ) {
        annotate_params_jsdoc(ast, &mut arrow.params, jsdoc);
        if arrow.return_type.is_none() {
            if let Some(ret) = &jsdoc.returns {
                if let Some(type_text) = &ret.type_text {
                    if let Some(tsty) = parse_jsdoc_type(ast, type_text) {
                        arrow.return_type =
                            Some(oxc::ast::ast::TSTypeAnnotation::boxed(SPAN, tsty, ast));
                    }
                }
            }
            if arrow.return_type.is_none() {
                arrow.return_type = Some(oxc::ast::ast::TSTypeAnnotation::boxed(
                    SPAN,
                    oxc::ast::ast::TSType::new_ts_any_keyword(SPAN, ast),
                    ast,
                ));
            }
        }
    }

    /// Set type annotations on formal parameters from JSDoc `@param` tags.
    /// Any parameter without a matching `@param` gets `any`.
    fn annotate_params_jsdoc<'a>(
        ast: &AstBuilder<'a>,
        params: &mut oxc::allocator::Box<'a, oxc::ast::ast::FormalParameters<'a>>,
        jsdoc: &JSDocInfo,
    ) {
        use oxc::ast::ast::{FormalParameter, FormalParameterRest};

        // Build a lookup: param name → type text.
        let mut param_types: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for p in &jsdoc.params {
            if let (Some(name), Some(ty)) = (&p.param_name, &p.type_text) {
                // Strip dotted suffix (e.g. `options.foo` → `options`).
                let base = name.split('.').next().unwrap_or(name);
                param_types.insert(base.to_string(), ty.clone());
            }
        }

        // Annotate each formal parameter.
        for item in params.items.iter_mut() {
            annotate_formal_parameter(ast, item, &param_types);
        }

        // Annotate the rest parameter if present.
        if let Some(rest) = params.rest.as_mut() {
            annotate_formal_parameter_rest(ast, rest, &param_types);
        }

        /// Annotate a single `FormalParameter`.
        fn annotate_formal_parameter<'a>(
            ast: &AstBuilder<'a>,
            param: &mut FormalParameter<'a>,
            param_types: &std::collections::HashMap<String, String>,
        ) {
            if param.type_annotation.is_some() {
                return;
            }
            let name = binding_pattern_name(&param.pattern);
            let type_text = name.as_deref().and_then(|n| param_types.get(n));
            let tsty = type_text
                .and_then(|t| parse_jsdoc_type(ast, t))
                .unwrap_or_else(|| oxc::ast::ast::TSType::new_ts_any_keyword(SPAN, ast));
            param.type_annotation = Some(oxc::ast::ast::TSTypeAnnotation::boxed(SPAN, tsty, ast));
        }

        /// Annotate a `FormalParameterRest` (rest parameter `...args`).
        fn annotate_formal_parameter_rest<'a>(
            ast: &AstBuilder<'a>,
            rest: &mut FormalParameterRest<'a>,
            param_types: &std::collections::HashMap<String, String>,
        ) {
            if rest.type_annotation.is_some() {
                return;
            }
            let name = binding_pattern_name(&rest.rest.argument);
            let type_text = name.as_deref().and_then(|n| param_types.get(n));
            // Rest parameters are arrays of the element type. If JSDoc says
            // `...args: string`, the TS type is `string[]`. If no JSDoc, `any[]`.
            let elem_type = type_text
                .and_then(|t| parse_jsdoc_type(ast, t))
                .unwrap_or_else(|| oxc::ast::ast::TSType::new_ts_any_keyword(SPAN, ast));
            let array_type = make_array_type(ast, elem_type);
            rest.type_annotation = Some(oxc::ast::ast::TSTypeAnnotation::boxed(
                SPAN, array_type, ast,
            ));
        }
    }

    /// Annotate variable declarators whose init is a function/arrow expression.
    fn annotate_variable_jsdoc<'a>(
        ast: &AstBuilder<'a>,
        var_decl: &mut VariableDeclaration<'a>,
        comments: &[oxc::ast::ast::Comment],
        source_text: &str,
        outer_span_start: u32,
    ) {
        for declarator in var_decl.declarations.iter_mut() {
            annotate_variable_declarator_jsdoc(
                ast,
                declarator,
                comments,
                source_text,
                outer_span_start,
            );
        }
    }

    /// Annotate a single `VariableDeclarator` from JSDoc.
    fn annotate_variable_declarator_jsdoc<'a>(
        ast: &AstBuilder<'a>,
        declarator: &mut VariableDeclarator<'a>,
        comments: &[oxc::ast::ast::Comment],
        source_text: &str,
        outer_span_start: u32,
    ) {
        // For class expressions, walk the body to annotate methods.
        if let Some(Expression::ClassExpression(class)) = &mut declarator.init {
            annotate_class_jsdoc(ast, &mut **class, comments, source_text, outer_span_start);
            return;
        }

        let Some(init) = &mut declarator.init else {
            return;
        };

        // Try the outer span first (export statement / var declaration start),
        // then fall back to the declarator's own span start. This handles both
        // `/** JSDoc */ export const fn = () => {}` and
        // `/** JSDoc */ const fn = () => {}`.
        let mut jsdoc = find_jsdoc_for_span(comments, outer_span_start, source_text);
        if jsdoc.params.is_empty() && jsdoc.returns.is_none() {
            jsdoc = find_jsdoc_for_span(comments, declarator.span.start, source_text);
        }

        match init {
            Expression::FunctionExpression(func) => {
                annotate_function_jsdoc(ast, func, &jsdoc);
            }
            Expression::ArrowFunctionExpression(arrow) => {
                annotate_arrow_jsdoc(ast, arrow, &jsdoc);
            }
            _ => {}
        }
    }

    /// Walk class body elements and annotate methods and property definitions.
    fn annotate_class_jsdoc<'a>(
        ast: &AstBuilder<'a>,
        class: &mut Class<'a>,
        comments: &[oxc::ast::ast::Comment],
        source_text: &str,
        _outer_span_start: u32,
    ) {
        for element in class.body.body.iter_mut() {
            match element {
                ClassElement::MethodDefinition(method) => {
                    // Skip constructors and setters — they don't need return types.
                    match method.kind {
                        MethodDefinitionKind::Constructor | MethodDefinitionKind::Set => {
                            // Still annotate constructor parameters from JSDoc.
                            if method.kind == MethodDefinitionKind::Constructor {
                                let jsdoc =
                                    find_jsdoc_for_span(comments, method.span.start, source_text);
                                annotate_function_jsdoc(ast, &mut method.value, &jsdoc);
                            }
                        }
                        MethodDefinitionKind::Method | MethodDefinitionKind::Get => {
                            let jsdoc =
                                find_jsdoc_for_span(comments, method.span.start, source_text);
                            annotate_function_jsdoc(ast, &mut method.value, &jsdoc);
                        }
                    }
                }
                ClassElement::PropertyDefinition(prop) => {
                    annotate_property_definition_jsdoc(ast, prop, comments, source_text);
                }
                _ => {}
            }
        }
    }

    /// Annotate a `PropertyDefinition` whose value is a function or arrow.
    fn annotate_property_definition_jsdoc<'a>(
        ast: &AstBuilder<'a>,
        prop: &mut PropertyDefinition<'a>,
        comments: &[oxc::ast::ast::Comment],
        source_text: &str,
    ) {
        let Some(value) = &mut prop.value else { return };
        let jsdoc = find_jsdoc_for_span(comments, prop.span.start, source_text);
        match value {
            Expression::FunctionExpression(func) => {
                annotate_function_jsdoc(ast, func, &jsdoc);
            }
            Expression::ArrowFunctionExpression(arrow) => {
                annotate_arrow_jsdoc(ast, arrow, &jsdoc);
            }
            _ => {}
        }
    }
}

/// Find and parse the JSDoc comment that precedes the AST node at
/// `span_start`. Returns an empty `JSDocInfo` if no JSDoc is found.
///
/// The lookup strategy:
/// 1. First, check if a JSDoc comment's `attached_to` matches `span_start`
///    (the standard oxc attachment model for leading comments).
/// 2. If that fails (e.g. the JSDoc is attached to a parent node like
///    `export`), fall back to scanning for any JSDoc comment whose span
///    ends at or just before `span_start` (allowing whitespace between).
fn find_jsdoc_for_span(
    comments: &[oxc::ast::ast::Comment],
    span_start: u32,
    source_text: &str,
) -> JSDocInfo {
    // Strategy 1: exact `attached_to` match.
    for comment in comments {
        if !comment.is_jsdoc() {
            continue;
        }
        if comment.attached_to == span_start {
            let raw = comment.span.source_text(source_text);
            return parse_jsdoc(raw);
        }
    }

    // Strategy 2: scan backwards from `span_start` for the nearest JSDoc
    // comment that ends just before it (only whitespace between comment end
    // and `span_start`). This handles cases where the JSDoc is attached to
    // a parent token (e.g. `export`) rather than the function itself.
    let mut best: Option<&oxc::ast::ast::Comment> = None;
    for comment in comments {
        if !comment.is_jsdoc() {
            continue;
        }
        if comment.span.end > span_start {
            continue;
        }
        // Check that only whitespace separates the comment end from span_start.
        let between = &source_text[comment.span.end as usize..span_start as usize];
        if between.chars().all(|c| c.is_whitespace()) {
            // Pick the latest (closest) such comment.
            if best.is_none_or(|b| comment.span.end > b.span.end) {
                best = Some(comment);
            }
        }
    }
    if let Some(comment) = best {
        let raw = comment.span.source_text(source_text);
        return parse_jsdoc(raw);
    }

    JSDocInfo::default()
}

/// Parse a raw JSDoc comment string (including `/**` and `*/`) into
/// [`JSDocInfo`].
fn parse_jsdoc(raw: &str) -> JSDocInfo {
    // Strip the opening `/**` (or `/*`) and closing `*/`.
    let inner = raw
        .strip_prefix("/**")
        .or_else(|| raw.strip_prefix("/*"))
        .unwrap_or(raw);
    let inner = inner.strip_suffix("*/").unwrap_or(inner);

    let mut info = JSDocInfo::default();

    // Process line by line, stripping leading `*` and whitespace.
    for line in inner.lines() {
        let trimmed = line.trim_start();
        let stripped = trimmed.strip_prefix('*').unwrap_or(trimmed).trim();
        if stripped.is_empty() {
            continue;
        }

        // Look for `@tag` at the start.
        if let Some(rest) = stripped.strip_prefix('@') {
            // Split tag name from the rest.
            let (tag_name, tag_body) = match rest.find(char::is_whitespace) {
                Some(idx) => (&rest[..idx], rest[idx..].trim()),
                None => (rest, ""),
            };
            match tag_name {
                "param" | "arg" | "argument" => {
                    info.params.push(parse_param_tag(tag_body));
                }
                "returns" | "return" => {
                    info.returns = Some(parse_returns_tag(tag_body));
                }
                _ => {}
            }
        }
    }

    info
}

/// Parse a `@param` tag body like `{string} name` or `{number} age - desc`.
fn parse_param_tag(body: &str) -> JSDocTag {
    let (type_text, rest) = extract_type_expr(body);
    // The remaining text after `{Type}` starts with the parameter name.
    // It may be `name`, `name.description`, or `name - description`.
    let param_name = rest.split_whitespace().next().map(|s| s.to_string());

    JSDocTag {
        param_name,
        type_text,
    }
}

/// Parse a `@returns` tag body like `{number}` or `{string} - description`.
fn parse_returns_tag(body: &str) -> JSDocTag {
    let (type_text, _rest) = extract_type_expr(body);
    JSDocTag {
        param_name: None,
        type_text,
    }
}

/// Extract the `{Type}` expression from the beginning of a tag body.
/// Returns `(Some(type_string), remaining_text)` or `(None, full_body)`.
fn extract_type_expr(body: &str) -> (Option<String>, &str) {
    let trimmed = body.trim_start();
    let Some(rest) = trimmed.strip_prefix('{') else {
        return (None, body);
    };
    // Find the matching closing `}`, accounting for nested braces.
    let mut depth = 1;
    let mut end = 0;
    for (i, ch) in rest.char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    end = i;
                    break;
                }
            }
            _ => {}
        }
    }
    if depth != 0 {
        return (None, body);
    }
    let type_str = rest[..end].trim().to_string();
    let remaining = rest[end + 1..].trim_start();
    (Some(type_str), remaining)
}

/// Parse a JSDoc type expression string (e.g. `"string"`, `"Array<number>"`,
/// `"number[]"`, `"string|number"`, `"Promise<number>"`) into a [`TSType`]
/// AST node. Returns `None` for types that are too complex to parse, in which
/// case the caller falls back to `any`.
fn parse_jsdoc_type<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    type_str: &str,
) -> Option<oxc::ast::ast::TSType<'a>> {
    let trimmed = type_str.trim();
    if trimmed.is_empty() {
        return None;
    }
    parse_union_type(ast, trimmed)
}

/// Parse a union type `A|B|C` (top level). Also handles `A | B` with spaces.
fn parse_union_type<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    type_str: &str,
) -> Option<oxc::ast::ast::TSType<'a>> {
    use oxc::span::SPAN;

    // Split on top-level `|` (not inside `<>` or `()`).
    let parts = split_top_level(type_str, '|');
    if parts.len() > 1 {
        let mut union_types: Vec<oxc::ast::ast::TSType<'a>> = Vec::new();
        for part in &parts {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            if let Some(t) = parse_primary_type(ast, part) {
                union_types.push(t);
            } else {
                // Can't parse one part — bail.
                return None;
            }
        }
        if union_types.is_empty() {
            return None;
        }
        if union_types.len() == 1 {
            return Some(union_types.into_iter().next().unwrap());
        }
        let union_vec = oxc::allocator::ArenaVec::from_iter_in(union_types, ast);
        return Some(oxc::ast::ast::TSType::new_ts_union_type(
            SPAN, union_vec, ast,
        ));
    }
    parse_primary_type(ast, type_str.trim())
}

/// Parse a primary type: keyword, type reference, array suffix, or generic.
fn parse_primary_type<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    type_str: &str,
) -> Option<oxc::ast::ast::TSType<'a>> {
    use oxc::ast::ast::{TSType, TSTypeName, TSTypeParameterInstantiation};
    use oxc::span::SPAN;
    use oxc::str::Ident;

    let trimmed = type_str.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Check for array suffix `T[]`.
    if trimmed.ends_with("[]") {
        let inner = &trimmed[..trimmed.len() - 2];
        let inner_type = parse_primary_type(ast, inner.trim())?;
        return Some(make_array_type(ast, inner_type));
    }

    // Check for generic `Name<...>`.
    if let Some(angle_pos) = find_top_level_angle(trimmed) {
        let name = trimmed[..angle_pos].trim();
        let generic_args = &trimmed[angle_pos + 1..trimmed.len() - 1];
        // Only handle `<>` if the string ends with `>`.
        if !trimmed.ends_with('>') {
            return None;
        }
        let inner_types = parse_generic_args(ast, generic_args)?;
        let type_args = {
            let v = oxc::allocator::ArenaVec::from_iter_in(inner_types, ast);
            TSTypeParameterInstantiation::boxed(SPAN, v, ast)
        };
        let ident = Ident::from_str_in(name, ast);
        let type_name = TSTypeName::new_identifier_reference(SPAN, ident, ast);
        return Some(TSType::new_ts_type_reference(
            SPAN,
            type_name,
            Some(type_args),
            ast,
        ));
    }

    // Primitive keywords.
    match trimmed {
        "string" => Some(TSType::new_ts_string_keyword(SPAN, ast)),
        "number" => Some(TSType::new_ts_number_keyword(SPAN, ast)),
        "boolean" | "bool" => Some(TSType::new_ts_boolean_keyword(SPAN, ast)),
        "symbol" => Some(TSType::new_ts_symbol_keyword(SPAN, ast)),
        "undefined" => Some(TSType::new_ts_undefined_keyword(SPAN, ast)),
        "null" => Some(TSType::new_ts_null_keyword(SPAN, ast)),
        "void" => Some(TSType::new_ts_void_keyword(SPAN, ast)),
        "any" => Some(TSType::new_ts_any_keyword(SPAN, ast)),
        "unknown" => Some(TSType::new_ts_unknown_keyword(SPAN, ast)),
        "never" => Some(TSType::new_ts_never_keyword(SPAN, ast)),
        "object" => Some(TSType::new_ts_object_keyword(SPAN, ast)),
        // `bigint` — no `new_ts_bigint_keyword` constructor, use type reference.
        "bigint" => {
            let ident = Ident::from_str_in("bigint", ast);
            let type_name = TSTypeName::new_identifier_reference(SPAN, ident, ast);
            Some(TSType::new_ts_type_reference(SPAN, type_name, None, ast))
        }
        // String literal: `"foo"` or `'foo'`.
        _ if (trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2) => {
            let inner = &trimmed[1..trimmed.len() - 1];
            let value = oxc::str::Str::from_str_in(inner, ast);
            let lit = oxc::ast::ast::StringLiteral::boxed(SPAN, value, None, ast);
            let tsliteral = oxc::ast::ast::TSLiteral::StringLiteral(lit);
            Some(TSType::new_ts_literal_type(SPAN, tsliteral, ast))
        }
        _ if (trimmed.starts_with('\'') && trimmed.ends_with('\'') && trimmed.len() >= 2) => {
            let inner = &trimmed[1..trimmed.len() - 1];
            let value = oxc::str::Str::from_str_in(inner, ast);
            let lit = oxc::ast::ast::StringLiteral::boxed(SPAN, value, None, ast);
            let tsliteral = oxc::ast::ast::TSLiteral::StringLiteral(lit);
            Some(TSType::new_ts_literal_type(SPAN, tsliteral, ast))
        }
        // Otherwise it's a type reference (e.g. `MyType`, `Foo.Bar`).
        _ => {
            // Validate it looks like a valid identifier path.
            if trimmed
                .chars()
                .all(|c| c.is_alphanumeric() || c == '_' || c == '$' || c == '.')
            {
                let ident = Ident::from_str_in(trimmed, ast);
                let type_name = TSTypeName::new_identifier_reference(SPAN, ident, ast);
                // Known generic types that require exactly one type argument.
                // If used without `<T>`, default to `<any>`.
                if is_single_arg_generic(trimmed) {
                    let any_type = TSType::new_ts_any_keyword(SPAN, ast);
                    let mut params = oxc::allocator::ArenaVec::with_capacity_in(1, ast);
                    params.push(any_type);
                    let type_args = TSTypeParameterInstantiation::boxed(SPAN, params, ast);
                    Some(TSType::new_ts_type_reference(
                        SPAN,
                        type_name,
                        Some(type_args),
                        ast,
                    ))
                } else {
                    Some(TSType::new_ts_type_reference(SPAN, type_name, None, ast))
                }
            } else {
                None
            }
        }
    }
}

/// Parse comma-separated generic type arguments `A, B, C`.
fn parse_generic_args<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    args: &str,
) -> Option<Vec<oxc::ast::ast::TSType<'a>>> {
    let parts = split_top_level(args, ',');
    let mut types = Vec::new();
    for part in parts {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        types.push(parse_union_type(ast, part)?);
    }
    if types.is_empty() { None } else { Some(types) }
}

/// Check if a type name is a known generic that requires exactly one type
/// argument (e.g. `Array`, `Promise`, `Set`). When such a type is used
/// without `<T>`, we default to `<any>`.
fn is_single_arg_generic(name: &str) -> bool {
    matches!(
        name,
        "Array"
            | "Promise"
            | "Set"
            | "WeakSet"
            | "ReadonlyArray"
            | "ReadonlySet"
            | "Observable"
            | "Iterable"
            | "Iterator"
            | "AsyncIterator"
    )
}

/// Make an array type `T[]` from an element type `T`.
fn make_array_type<'a>(
    ast: &oxc::ast::builder::AstBuilder<'a>,
    elem_type: oxc::ast::ast::TSType<'a>,
) -> oxc::ast::ast::TSType<'a> {
    use oxc::ast::ast::{TSType, TSTypeName, TSTypeParameterInstantiation};
    use oxc::span::SPAN;
    use oxc::str::Ident;

    let mut params = oxc::allocator::ArenaVec::with_capacity_in(1, ast);
    params.push(elem_type);
    let type_args = TSTypeParameterInstantiation::boxed(SPAN, params, ast);
    let ident = Ident::from_str_in("Array", ast);
    let array_name = TSTypeName::new_identifier_reference(SPAN, ident, ast);
    TSType::new_ts_type_reference(SPAN, array_name, Some(type_args), ast)
}

/// Split a string on a delimiter character, but only at the top level
/// (not inside `<>`, `()`, `[]`, or `{}`).
fn split_top_level(s: &str, delim: char) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth: i32 = 0;
    let mut start = 0;
    for (i, ch) in s.char_indices() {
        match ch {
            '<' | '(' | '[' | '{' => depth += 1,
            '>' | ')' | ']' | '}' => depth -= 1,
            c if c == delim && depth == 0 => {
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&s[start..]);
    parts
}

/// Find the position of the top-level `<` that starts a generic type
/// argument list, if the string contains one and it's balanced.
/// Returns the index of `<`, or `None` if not found or unbalanced.
fn find_top_level_angle(s: &str) -> Option<usize> {
    let angle_pos = s.find('<')?;
    // Verify the `>` at the end matches this `<`.
    if !s.ends_with('>') {
        return None;
    }
    // Check balance.
    let mut depth = 0;
    for ch in s.chars() {
        match ch {
            '<' => depth += 1,
            '>' => depth -= 1,
            _ => {}
        }
        if depth < 0 {
            return None;
        }
    }
    if depth == 0 { Some(angle_pos) } else { None }
}

/// Extract the bound name from a `BindingPattern` (e.g. the parameter name).
/// Returns `None` for destructuring patterns (object/array).
fn binding_pattern_name(pattern: &oxc::ast::ast::BindingPattern<'_>) -> Option<String> {
    use oxc::ast::ast::BindingPattern;
    match pattern {
        BindingPattern::BindingIdentifier(bi) => Some(bi.name.as_str().to_string()),
        BindingPattern::AssignmentPattern(ap) => {
            // `param = default` — recurse into the left pattern.
            binding_pattern_name_inner(&ap.left)
        }
        _ => None,
    }
}

/// Helper for `binding_pattern_name` that handles the `AssignmentPattern` case
/// without borrowing issues.
fn binding_pattern_name_inner(pattern: &oxc::ast::ast::BindingPattern<'_>) -> Option<String> {
    use oxc::ast::ast::BindingPattern;
    match pattern {
        BindingPattern::BindingIdentifier(bi) => Some(bi.name.as_str().to_string()),
        _ => None,
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

    /// A function returning a value but with no explicit type gets `: unknown`.
    #[test]
    fn synthesizes_unknown_for_returning_function() {
        let out = emit_dts("export function foo() { return 1; }", SourceType::ts());
        assert!(out.contains("foo(): unknown"), "got: {out}");
    }

    /// An async function returning a value gets `: Promise<unknown>`.
    #[test]
    fn synthesizes_promise_unknown_for_async_returning() {
        let out = emit_dts(
            "export async function foo() { return 1; }",
            SourceType::ts(),
        );
        assert!(out.contains("foo(): Promise<unknown>"), "got: {out}");
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
        // The synthesized type should include the parameter and `unknown` return.
        assert!(out.contains("(a: number)"), "got: {out}");
        assert!(out.contains("unknown"), "got: {out}");
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

    /// A class method that returns a value gets `: unknown`.
    #[test]
    fn synthesizes_unknown_for_class_method_returning() {
        let out = emit_dts(
            "export class C { method() { return 1; } }",
            SourceType::ts(),
        );
        assert!(out.contains("method(): unknown"), "got: {out}");
    }

    /// An async class method that returns a value gets `: Promise<unknown>`.
    #[test]
    fn synthesizes_promise_unknown_for_async_class_method_returning() {
        let out = emit_dts(
            "export class C { async method() { return 1; } }",
            SourceType::ts(),
        );
        assert!(out.contains("method(): Promise<unknown>"), "got: {out}");
    }

    /// A class getter with no explicit return type gets `: unknown`.
    #[test]
    fn synthesizes_unknown_for_class_getter() {
        let out = emit_dts(
            "export class C { get value() { return 42; } }",
            SourceType::ts(),
        );
        assert!(out.contains("get value(): unknown"), "got: {out}");
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
        assert!(out.contains("unknown"), "got: {out}");
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

    // ─── JS source .d.ts generation (no JSDoc → `any` fallback) ────────

    /// JS source function with no JSDoc gets `any` return type.
    #[test]
    fn js_function_no_jsdoc_gets_any_return() {
        let out = emit_dts("export function foo() {}", SourceType::mjs());
        assert!(out.contains("foo(): any"), "got: {out}");
    }

    /// JS source async function with no JSDoc gets `any` return type.
    #[test]
    fn js_async_function_no_jsdoc_gets_any_return() {
        let out = emit_dts("export async function foo() {}", SourceType::mjs());
        assert!(out.contains("foo(): any"), "got: {out}");
    }

    /// JS source class method with no JSDoc gets `any` return type.
    #[test]
    fn js_class_method_no_jsdoc_gets_any_return() {
        let out = emit_dts(
            "export class C { method() { console.log('hi'); } }",
            SourceType::mjs(),
        );
        assert!(out.contains("method(): any"), "got: {out}");
    }

    /// JS source class async method with no JSDoc gets `any` return type.
    #[test]
    fn js_class_async_method_no_jsdoc_gets_any_return() {
        let out = emit_dts(
            "export class C { async method() { return 1; } }",
            SourceType::mjs(),
        );
        assert!(out.contains("method(): any"), "got: {out}");
    }

    /// JS source class getter with no JSDoc gets `any` return type.
    #[test]
    fn js_class_getter_no_jsdoc_gets_any_return() {
        let out = emit_dts(
            "export class C { get value() { return 42; } }",
            SourceType::mjs(),
        );
        assert!(out.contains("get value(): any"), "got: {out}");
    }

    /// JS source arrow function with no JSDoc gets `any` return type and `any` params.
    #[test]
    fn js_arrow_const_no_jsdoc_gets_any() {
        let out = emit_dts("export const fn = (a) => a + 1;", SourceType::mjs());
        assert!(out.contains("export declare const fn"), "got: {out}");
        assert!(out.contains("any"), "got: {out}");
    }

    /// JS source class with arrow function property and no JSDoc gets `any`.
    #[test]
    fn js_class_arrow_property_no_jsdoc_gets_any() {
        let out = emit_dts(
            "export class C { handler = () => { return 1; }; }",
            SourceType::mjs(),
        );
        assert!(out.contains("handler"), "got: {out}");
        assert!(out.contains("any"), "got: {out}");
    }

    /// JS function with no JSDoc — parameters get `any`.
    #[test]
    fn js_function_no_jsdoc_params_get_any() {
        let out = emit_dts(
            "export function foo(a, b) { return a + b; }",
            SourceType::mjs(),
        );
        assert!(out.contains("a: any"), "got: {out}");
        assert!(out.contains("b: any"), "got: {out}");
        assert!(out.contains("foo(a: any, b: any): any"), "got: {out}");
    }

    // ─── JS source with JSDoc type extraction ───────────────────────────

    /// JSDoc `@param` and `@returns` should be extracted into TS annotations.
    #[test]
    fn js_jsdoc_param_and_returns() {
        let src = r#"
/**
 * @param {string} name
 * @param {number} age
 * @returns {string}
 */
export function greet(name, age) { return name; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("name: string"), "got: {out}");
        assert!(out.contains("age: number"), "got: {out}");
        assert!(
            out.contains("greet(name: string, age: number): string"),
            "got: {out}"
        );
    }

    /// JSDoc `@returns` without `@param` — params get `any`, return gets JSDoc type.
    #[test]
    fn js_jsdoc_returns_only() {
        let src = r#"
/**
 * @returns {number}
 */
export function count() { return 42; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("count(): number"), "got: {out}");
    }

    /// JSDoc `@param` without `@returns` — return gets `any`.
    #[test]
    fn js_jsdoc_param_only() {
        let src = r#"
/**
 * @param {string} name
 */
export function hello(name) { return name; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("name: string"), "got: {out}");
        assert!(out.contains("hello(name: string): any"), "got: {out}");
    }

    /// JSDoc on class methods should be extracted.
    #[test]
    fn js_jsdoc_class_method() {
        let src = r#"
export class C {
  /**
   * @param {number} x
   * @returns {void}
   */
  method(x) { console.log(x); }
}
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("x: number"), "got: {out}");
        assert!(out.contains("method(x: number): void"), "got: {out}");
    }

    /// JSDoc array type `Array<T>` should be parsed.
    #[test]
    fn js_jsdoc_array_type() {
        let src = r#"
/**
 * @param {Array<number>} nums
 * @returns {Array<string>}
 */
export function transform(nums) { return nums.map(String); }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("nums: Array<number>"), "got: {out}");
        assert!(out.contains("Array<string>"), "got: {out}");
    }

    /// JSDoc array suffix `T[]` should be parsed.
    #[test]
    fn js_jsdoc_array_suffix_type() {
        let src = r#"
/**
 * @param {number[]} nums
 * @returns {string[]}
 */
export function transform(nums) { return nums.map(String); }
"#;
        let out = emit_dts(src, SourceType::mjs());
        // `T[]` is codegen'd as `Array<T>` by oxc.
        assert!(out.contains("nums: Array<number>"), "got: {out}");
        assert!(out.contains("Array<string>"), "got: {out}");
    }

    /// JSDoc union type `string|number` should be parsed.
    #[test]
    fn js_jsdoc_union_type() {
        let src = r#"
/**
 * @param {string|number} value
 * @returns {boolean}
 */
export function check(value) { return true; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("value: string | number"), "got: {out}");
        assert!(
            out.contains("check(value: string | number): boolean"),
            "got: {out}"
        );
    }

    /// JSDoc Promise type should be parsed.
    #[test]
    fn js_jsdoc_promise_type() {
        let src = r#"
/**
 * @returns {Promise<number>}
 */
export async function fetchCount() { return 42; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("fetchCount(): Promise<number>"), "got: {out}");
    }

    /// JSDoc custom type reference should be parsed.
    #[test]
    fn js_jsdoc_custom_type() {
        let src = r#"
/**
 * @param {MyType} obj
 * @returns {MyType}
 */
export function process(obj) { return obj; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("obj: MyType"), "got: {out}");
        assert!(out.contains("process(obj: MyType): MyType"), "got: {out}");
    }

    /// Known single-arg generics used without `<T>` should default to `<any>`.
    #[test]
    fn js_jsdoc_generic_without_args_defaults_to_any() {
        let src = r#"
/**
 * @returns {Promise}
 */
export async function foo() { return 1; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("foo(): Promise<any>"), "got: {out}");
    }

    /// `Array` without type args should default to `Array<any>`.
    #[test]
    fn js_jsdoc_array_without_args_defaults_to_any() {
        let src = r#"
/**
 * @param {Array} items
 * @returns {Array}
 */
export function foo(items) { return items; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("items: Array<any>"), "got: {out}");
        assert!(
            out.contains("foo(items: Array<any>): Array<any>"),
            "got: {out}"
        );
    }

    /// JSDoc with mixed annotated and unannotated params.
    #[test]
    fn js_jsdoc_partial_params() {
        let src = r#"
/**
 * @param {string} name
 */
export function foo(name, age) { return name; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("name: string"), "got: {out}");
        assert!(out.contains("age: any"), "got: {out}");
        assert!(
            out.contains("foo(name: string, age: any): any"),
            "got: {out}"
        );
    }

    /// JSDoc on a const arrow function.
    #[test]
    fn js_jsdoc_arrow_const() {
        let src = r#"
/**
 * @param {number} x
 * @returns {number}
 */
export const fn = (x) => x + 1;
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("export declare const fn"), "got: {out}");
        assert!(out.contains("x: number"), "got: {out}");
        assert!(out.contains("number"), "got: {out}");
    }

    /// JSDoc `@return` (singular) should also be recognized.
    #[test]
    fn js_jsdoc_return_singular() {
        let src = r#"
/**
 * @return {string}
 */
export function getName() { return 'hi'; }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("getName(): string"), "got: {out}");
    }

    /// JSDoc with `@arg` alias should be recognized.
    #[test]
    fn js_jsdoc_arg_alias() {
        let src = r#"
/**
 * @arg {string} name
 * @returns {void}
 */
export function sayHello(name) { console.log(name); }
"#;
        let out = emit_dts(src, SourceType::mjs());
        assert!(out.contains("name: string"), "got: {out}");
        assert!(out.contains("sayHello(name: string): void"), "got: {out}");
    }

    /// JSDoc rest parameter should get an array type.
    #[test]
    fn js_jsdoc_rest_param() {
        let src = r#"
/**
 * @param {number} args
 * @returns {number}
 */
export function sum(...args) { return args.reduce((a, b) => a + b, 0); }
"#;
        let out = emit_dts(src, SourceType::mjs());
        // Rest params are codegen'd as `Array<T>` by oxc.
        assert!(out.contains("args: Array<number>"), "got: {out}");
    }

    /// TS source should NOT get the JSDoc `any` fallback.
    #[test]
    fn ts_source_not_affected_by_jsdoc_pass() {
        let out = emit_dts("export function foo() {}", SourceType::ts());
        assert!(out.contains("foo(): void"), "got: {out}");
    }
}
