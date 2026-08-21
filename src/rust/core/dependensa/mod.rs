pub mod dep_tree;
pub mod graph;

use std::path::Path;

use oxc::allocator::Allocator;
use oxc::ast::ast::Expression;
use oxc::ast_visit::Visit;
use oxc::parser::Parser;
use oxc::span::SourceType;

use dep_tree::duplicates::check_duplicates;
pub use dep_tree::types::{DependenciesTree, DepsFile, ModuleType, ValidExts};
pub use graph::generate_graph;

/// Detect whether a source file uses CommonJS or ESM syntax, mirroring
/// `utils.checks.moduleType` from `node_src/helpers/utilities.ts`.
///
/// Returns the [`ModuleType`]:
/// - `Json` for `.json` files.
/// - `Cjs` when CommonJS syntax (`require`, `module.exports`, `exports.x`) is
///   present without ESM syntax.
/// - `Esm` otherwise (ESM syntax present, or no module syntax).
fn detect_module_type(content: &str, file_path: &Path) -> ModuleType {
    let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");

    if ext == "json" {
        return ModuleType::Json;
    }

    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    // If parsing fails, fall back to ESM.
    let parser_return = Parser::new(&allocator, content, source_type).parse();
    let program = &parser_return.program;

    let mut detector = ModuleTypeDetector::default();
    detector.visit_program(program);

    if detector.is_common_js && !detector.is_esm {
        ModuleType::Cjs
    } else if detector.is_esm && detector.is_common_js {
        // Mixed — treat as ESM (matches the TS version's `_esmCount++` branch).
        ModuleType::Esm
    } else {
        // ESM or no module syntax detected → default to ESM.
        ModuleType::Esm
    }
}

#[derive(Default)]
struct ModuleTypeDetector {
    is_esm: bool,
    is_common_js: bool,
}

impl<'a> Visit<'a> for ModuleTypeDetector {
    // ESM: import declarations.
    fn visit_import_declaration(&mut self, _it: &oxc::ast::ast::ImportDeclaration<'a>) {
        self.is_esm = true;
        // Don't walk children — we only care about the declaration itself.
    }

    // ESM: export named declarations.
    fn visit_export_named_declaration(&mut self, _it: &oxc::ast::ast::ExportNamedDeclaration<'a>) {
        self.is_esm = true;
    }

    // ESM: export default declarations.
    fn visit_export_default_declaration(
        &mut self,
        _it: &oxc::ast::ast::ExportDefaultDeclaration<'a>,
    ) {
        self.is_esm = true;
    }

    // ESM: export all declarations (`export * from "..."`).
    fn visit_export_all_declaration(&mut self, _it: &oxc::ast::ast::ExportAllDeclaration<'a>) {
        self.is_esm = true;
    }

    // TS import-equals (`import foo = require("...")`) counts as ESM.
    fn visit_ts_import_equals_declaration(
        &mut self,
        _it: &oxc::ast::ast::TSImportEqualsDeclaration<'a>,
    ) {
        self.is_esm = true;
    }

    // CommonJS: `require(...)` calls.
    fn visit_call_expression(&mut self, it: &oxc::ast::ast::CallExpression<'a>) {
        if let Expression::Identifier(ident) = &it.callee {
            if ident.name.as_str() == "require" {
                self.is_common_js = true;
                // Don't walk children — we already captured it.
                return;
            }
        }
        // Otherwise walk normally to find nested require/import expressions.
        self.visit_expression(&it.callee);
        self.visit_arguments(&it.arguments);
    }

    // CommonJS: `module.exports` / `exports.x` static member access.
    fn visit_static_member_expression(&mut self, it: &oxc::ast::ast::StaticMemberExpression<'a>) {
        if let Expression::Identifier(ident) = &it.object {
            let name = ident.name.as_str();
            let prop = it.property.name.as_str();
            if (name == "module" && prop == "exports") || name == "exports" {
                self.is_common_js = true;
            }
        }
        // Walk children to find more.
        self.visit_expression(&it.object);
    }
}

/// Detect whether a source file contains JSX syntax, mirroring
/// `utils.checks.isJsxContent` from `node_src/helpers/utilities.ts`.
fn is_jsx_content(content: &str, file_path: &Path) -> bool {
    let allocator = Allocator::default();
    // Parse as TSX to detect JSX regardless of the file's real extension.
    let source_type = SourceType::from_path(file_path)
        .unwrap_or_default()
        .with_jsx(true);
    let parser_return = Parser::new(&allocator, content, source_type).parse();
    let program = &parser_return.program;

    let mut detector = JsxDetector::default();
    detector.visit_program(program);
    detector.contains_jsx
}

#[derive(Default)]
struct JsxDetector {
    contains_jsx: bool,
}

impl<'a> Visit<'a> for JsxDetector {
    fn visit_jsx_element(&mut self, _it: &oxc::ast::ast::JSXElement<'a>) {
        self.contains_jsx = true;
    }

    fn visit_jsx_fragment(&mut self, _it: &oxc::ast::ast::JSXFragment<'a>) {
        self.contains_jsx = true;
    }
}

/// Read a file relative to `root`, returning its content and byte length.
fn read_file(root: &Path, rel_path: &str) -> std::io::Result<(String, usize)> {
    let abs = root.join(rel_path);
    let content = std::fs::read_to_string(&abs)?;
    let bytes = content.len();
    Ok((content, bytes))
}

/// Build the dependency tree from `entry` relative to `root`.
///
/// This is the Rust equivalent of `generateDependencies` from
/// `node_src/dependencies/index.ts`. It:
/// 1. Generates and topologically sorts the dependency graph.
/// 2. Reads each file and determines its module type / JSX status.
/// 3. Checks for duplicate declarations.
///
/// Unlike the TS version, the `bundledSourceFile` callback is not needed —
/// oxc parses source directly inline. Duplicate checking is performed but
/// does not exit the process; findings are discarded (callers may extend this
/// to surface them).
///
/// # Examples
///
/// Build the dependency tree starting from `src/index.ts` in the current
/// directory, then inspect each file's module type and JSX status:
///
/// ```no_run
/// use dependensa::generate_dependencies;
///
/// let tree = generate_dependencies("src/index.ts", ".")?;
///
/// println!("entry: {}", tree.entry);
///
/// for dep in &tree.dep_files {
///     println!(
///         "{}  {:?}  bytes={}  jsx={}",
///         dep.file, dep.module_type, dep.bytes, dep.is_jsx
///     );
/// }
///
/// // NPM packages referenced by the project
/// for npm in &tree.npm {
///     println!("npm: {}", npm);
/// }
/// # Ok::<(), std::io::Error>(())
/// ```
///
/// Serialize the whole tree to JSON (the result implements
/// `serde::Serialize`):
///
/// ```no_run
/// use dependensa::generate_dependencies;
///
/// let tree = generate_dependencies("src/index.ts", ".")?;
/// let json = serde_json::to_string_pretty(&tree)?;
/// println!("{}", json);
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub fn generate_dependencies<P: AsRef<Path>>(
    entry: &str,
    root: P,
) -> std::io::Result<DependenciesTree> {
    let root = root.as_ref().to_path_buf();

    // 1. Build and sort the dependency graph.
    let graph = generate_graph(entry, &root)?;
    let sorted = graph.sort();
    let npm = graph.npm().to_vec();
    let nodes = graph.node().to_vec();
    let warns = graph.warn().to_vec();

    // Compare full relative paths, not just file names, so that only the
    // actual entry file is marked as `is_entry`. Using just the file name
    // (e.g. "index.ts") would match every `index.ts` in the project.
    let entry_normalized = entry.replace('\\', "/");
    let is_entry_file = |file: &str| file.replace('\\', "/") == entry_normalized;

    let mut dep_files: Vec<DepsFile> = Vec::with_capacity(sorted.len());

    for file in sorted {
        let path = Path::new(&file);
        let file_ext_str = path.extension().and_then(|e| e.to_str()).unwrap_or("");

        let (content, bytes) = match read_file(&root, &file) {
            Ok(c) => c,
            Err(e) => {
                // Mirror the TS version which exits on missing files; here we
                // surface the error to the caller.
                return Err(e);
            }
        };

        let module_type = detect_module_type(&content, path);
        let is_jsx = is_jsx_content(&content, path);
        let is_entry = is_entry_file(&file);
        let file_ext = ValidExts::from_path_ext(file_ext_str).unwrap_or(ValidExts::Ts);

        dep_files.push(DepsFile {
            file: file.clone(),
            content,
            bytes,
            module_type,
            file_ext,
            is_jsx,
            is_entry,
        });
    }

    // 3. Check for duplicate declarations.
    let _duplicates = check_duplicates(&dep_files);
    // The TS version prints warnings and exits on duplicates; here we return
    // the tree and let the caller decide how to handle duplicates.

    Ok(DependenciesTree {
        entry: entry.to_string(),
        npm,
        nodes,
        warns,
        dep_files,
    })
}
