//! susee_check — diagnostic checks that run after generating `susee_tree`.
//!
//! This module inspects a [`DependenciesTree`] and reports five categories of
//! problems that hurt bundling quality and type safety. Each check prints a
//! pretty, human-readable report to stderr (using [`colored`] for emphasis)
//! and, when a problem is found, exits the process with code 1 so CI fails
//! fast.
//!
//! ## Checks
//!
//! 1. **Duplicated declarations** — the same top-level declaration name is
//!    declared in two or more `dep_files`. Reports the name, the files, and
//!    the line position of every declaration.
//! 2. **Anonymous imports/exports** — an anonymous default export (e.g.
//!    `export default function () {}`, `export default 42`) is imported by
//!    another file. Reports where the anonymous export lives, where it is
//!    imported, and the line position of every usage of the imported binding.
//! 3. **`export default`** — any `export default` (named or anonymous) is
//!    present. Reports the file and suggests a named export instead.
//! 4. **Missing types** — a declaration (variable, function, class, parameter,
//!    return) lacks an explicit type annotation. For JS files this suggests
//!    JSDoc alternatives (`@typedef`, `@param`, `@returns`, `@type`,
//!    `@import`). Reports the file and line position of every gap.
//! 5. **Undefined usage** — an identifier is referenced but never declared or
//!    imported in its file (and is not a known global). Reports the file and
//!    line position of every undefined reference.
//!
//! ## Integration
//!
//! [`check`] takes a [`DependenciesTree`] (produced by
//! [`crate::core::susee_tree::susee_tree`]) and runs all five checks in
//! order. It is meant to be called **after** `susee_tree` and **before**
//! `run_tree_hooks` (the hooks rename/strip, which would mask the issues).
//!
//! The function returns `Ok(())` when no issues are found, or `Err(())` after
//! printing the report and before the caller decides whether to exit. Callers
//! that want process termination should use [`check_and_exit`], which calls
//! `std::process::exit(1)` on the first failing category (matching the
//! spec's "exit with code 1" wording).

mod helpers;

use colored::Colorize;
use susee_types::DepsFile;

use helpers::{
    CheckReport, check_anonymous, check_default_exports, check_duplicates, check_missing_types,
    check_undefined_usage,
};

/// Run all five checks against `tree` and print a consolidated report.
///
/// Returns `Ok(())` when the tree is clean. When any check finds issues it
/// prints its report to stderr; the function still runs the remaining checks
/// so the user sees *all* problems in one pass, then returns `Err(())`.
fn check_options(dep_files: Vec<DepsFile>) -> Result<(), ()> {
    let reports: Vec<CheckReport> = vec![
        check_anonymous(dep_files.clone()),
        check_default_exports(dep_files.clone()),
        check_missing_types(dep_files.clone()),
        check_undefined_usage(dep_files.clone()),
    ];

    let mut had_issue = false;
    for report in &reports {
        if report.has_issues() {
            print_report(report);
            had_issue = true;
        }
    }

    if had_issue { Err(()) } else { Ok(()) }
}
/// check duplicated
fn check_dup(dep_files: Vec<DepsFile>) -> Result<(), ()> {
    let reports: Vec<CheckReport> = vec![check_duplicates(dep_files.clone())];

    let mut had_issue = false;
    for report in &reports {
        if report.has_issues() {
            print_report(report);
            had_issue = true;
        }
    }

    if had_issue { Err(()) } else { Ok(()) }
}

/// Run check duplicated
pub fn run_check_duplicated(dep_files: Vec<DepsFile>) {
    println!(
        "{}",
        "Susee running duplicated declarations check…".cyan().bold()
    );
    match check_dup(dep_files) {
        Ok(()) => {
            println!("{}", "No duplicated declarations found ✓".green().bold());
        }
        Err(()) => {
            let info = "Susee found duplicated declarations that must be fixed before bundling.";
            let cause = "See the report above for file names, line positions, and suggested fixes.";
            susee_log::error(info, cause, true);
        }
    }
}

/// Run [`check`] and, on failure, exit the process with code 1.
///
/// This is the convenience entry point used by the build pipeline. It prints
/// a short header before the reports and a summary line afterward.
pub fn run_options_check(dep_files: Vec<DepsFile>) {
    println!("{}", "Susee running 4 checks…".cyan().bold());
    match check_options(dep_files) {
        Ok(()) => {
            println!("{}", "susee: no issues found ✓".green().bold());
        }
        Err(()) => {
            let info = "Susee found issues that must be fixed before bundling.";
            let cause = "See the report above for file names, line positions, and \
                         suggested fixes. Each category that found issues must be \
                         resolved (or the declaration renamed to a named export).";
            susee_log::error(info, cause, true);
        }
    }
}

// ---------------------------------------------------------------------------
// Pretty-printing
// ---------------------------------------------------------------------------

fn print_report(report: &CheckReport) {
    let header = match report.kind {
        helpers::CheckKind::Duplicates => "Duplicated declarations",
        helpers::CheckKind::Anonymous => "Anonymous imports/exports",
        helpers::CheckKind::ExportDefault => "export default usage",
        helpers::CheckKind::MissingTypes => "Missing type annotations",
        helpers::CheckKind::UndefinedUsage => "Undefined identifier usage",
    };

    eprintln!();
    eprintln!(
        "[{}] {} — {} issue(s)",
        report.kind.label().red().bold(),
        header.yellow().bold(),
        report.items.len()
    );
    for item in &report.items {
        eprintln!("  • {}", item.message);
        for detail in &item.details {
            eprintln!("      {}", detail);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use susee_types::{DepsFile, ModuleType, ValidExts};

    /// Build a `DepsFile` for a `.js` file (ESM) — JSDoc territory.
    fn js_dep(file: &str, content: &str) -> DepsFile {
        DepsFile {
            file: file.to_string(),
            content: content.to_string(),
            bytes: content.len(),
            module_type: ModuleType::Esm,
            file_ext: ValidExts::Js,
            is_jsx: false,
            is_entry: false,
        }
    }

    /// Build a `DepsFile` for a `.ts` file (ESM) — inline-annotation territory.
    fn ts_dep(file: &str, content: &str) -> DepsFile {
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

    // --- missing types: TS files ---

    #[test]
    fn ts_function_without_return_type_is_flagged() {
        let deps = vec![ts_dep("a.ts", "export function foo() { return 1; }\n")];
        assert!(check_options(deps).is_err());
    }

    #[test]
    fn ts_function_with_return_type_is_clean() {
        let deps = vec![ts_dep(
            "a.ts",
            "export function foo(): number { return 1; }\n",
        )];
        // Only the missing-types check would flag this; with a return type it
        // should pass all checks.
        assert!(check_options(deps).is_ok());
    }

    // --- missing types: JS files without JSDoc are flagged ---

    #[test]
    fn js_function_without_jsdoc_is_flagged() {
        let deps = vec![js_dep("a.js", "export function foo(x) { return x; }\n")];
        assert!(check_options(deps).is_err());
    }

    // --- missing types: JS files WITH JSDoc are NOT flagged ---

    #[test]
    fn js_function_with_full_jsdoc_is_clean() {
        let deps = vec![js_dep(
            "a.js",
            "/**\n * @param {number} x\n * @returns {number}\n */\n\
             export function foo(x) { return x; }\n",
        )];
        assert!(check_options(deps).is_ok());
    }

    #[test]
    fn js_arrow_with_jsdoc_is_clean() {
        let deps = vec![js_dep(
            "a.js",
            "/**\n * @param {string} s\n * @returns {string}\n */\n\
             export const greet = (s) => s;\n",
        )];
        assert!(check_options(deps).is_ok());
    }

    #[test]
    fn js_variable_with_type_tag_is_clean() {
        let deps = vec![js_dep(
            "a.js",
            "/** @type {number} */\nexport const count = 42;\n",
        )];
        assert!(check_options(deps).is_ok());
    }

    #[test]
    fn js_function_with_returns_but_missing_param_is_flagged() {
        // `@returns` present but `x` has no `@param` → param should be flagged.
        let deps = vec![js_dep(
            "a.js",
            "/**\n * @returns {number}\n */\nexport function foo(x) { return x; }\n",
        )];
        assert!(check_options(deps).is_err());
    }

    #[test]
    fn js_function_with_param_but_missing_returns_is_flagged() {
        // `@param` present but no `@returns` → return type should be flagged.
        let deps = vec![js_dep(
            "a.js",
            "/**\n * @param {number} x\n */\nexport function foo(x) { return x; }\n",
        )];
        assert!(check_options(deps).is_err());
    }

    // --- other checks still work ---

    #[test]
    fn duplicate_declaration_detected() {
        let deps = vec![
            ts_dep("a.ts", "export const shared: number = 1;\n"),
            ts_dep("b.ts", "export const shared: number = 2;\n"),
        ];
        assert!(check_dup(deps).is_err());
    }

    #[test]
    fn export_default_detected() {
        let deps = vec![ts_dep("a.ts", "export default function hello(): void {}\n")];
        assert!(check_options(deps).is_err());
    }

    // --- duplicates: CJS require-imports are NOT declarations ---

    /// Build a `DepsFile` for a `.cjs` file (CommonJS).
    fn cjs_dep(file: &str, content: &str) -> DepsFile {
        DepsFile {
            file: file.to_string(),
            content: content.to_string(),
            bytes: content.len(),
            module_type: ModuleType::Cjs,
            file_ext: ValidExts::Cjs,
            is_jsx: false,
            is_entry: false,
        }
    }

    #[test]
    fn cjs_destructured_require_is_not_duplicate_of_export() {
        // `class Foo {}` in foo.cjs is the declaration; `const { Foo } =
        // require("./foo")` in index.cjs is an *import* of it, not a second
        // declaration. The duplicates check must NOT flag this.
        let deps = vec![
            cjs_dep("foo.cjs", "class Foo {}\nmodule.exports = { Foo };\n"),
            cjs_dep(
                "index.cjs",
                "const { Foo } = require(\"./foo\");\nmodule.exports = Foo;\n",
            ),
        ];
        // Duplicates check should be clean — the only real declaration is
        // `Foo` in foo.cjs. (The other checks may flag missing types /
        // export-default-equivalents, but NOT duplicates.)
        let dup_report = helpers::check_duplicates(deps.clone());
        assert!(
            !dup_report.has_issues(),
            "CJS require-import should not be a duplicate: {:?}",
            dup_report.items
        );
    }

    #[test]
    fn cjs_namespace_require_is_not_duplicate_of_export() {
        // `const Foo = require("./foo")` — namespace import, not a declaration.
        let deps = vec![
            cjs_dep("foo.cjs", "class Foo {}\nmodule.exports = Foo;\n"),
            cjs_dep(
                "index.cjs",
                "const Foo = require(\"./foo\");\nmodule.exports = Foo;\n",
            ),
        ];
        let dup_report = helpers::check_duplicates(deps.clone());
        assert!(
            !dup_report.has_issues(),
            "CJS namespace require-import should not be a duplicate: {:?}",
            dup_report.items
        );
    }

    #[test]
    fn cjs_require_member_access_is_not_duplicate() {
        // `const Foo = require("./foo").Foo` — member-access require import.
        let deps = vec![
            cjs_dep("foo.cjs", "class Foo {}\nmodule.exports = { Foo };\n"),
            cjs_dep(
                "index.cjs",
                "const Foo = require(\"./foo\").Foo;\nmodule.exports = Foo;\n",
            ),
        ];
        let dup_report = helpers::check_duplicates(deps.clone());
        assert!(
            !dup_report.has_issues(),
            "CJS member-access require-import should not be a duplicate: {:?}",
            dup_report.items
        );
    }

    #[test]
    fn ts_import_equals_require_is_not_duplicate() {
        // `import Foo = require("./foo")` (TS import-equals) is an import.
        let deps = vec![
            cjs_dep("foo.cts", "class Foo {}\nexport = Foo;\n"),
            cjs_dep(
                "index.cts",
                "import Foo = require(\"./foo\");\nexport = Foo;\n",
            ),
        ];
        let dup_report = helpers::check_duplicates(deps.clone());
        assert!(
            !dup_report.has_issues(),
            "TS import-equals require should not be a duplicate: {:?}",
            dup_report.items
        );
    }

    #[test]
    fn real_duplicate_still_detected_in_cjs() {
        // Two actual `class Foo {}` declarations (not imports) → duplicate.
        let deps = vec![
            cjs_dep("a.cjs", "class Foo {}\nmodule.exports = Foo;\n"),
            cjs_dep("b.cjs", "class Foo {}\nmodule.exports = Foo;\n"),
        ];
        let dup_report = helpers::check_duplicates(deps);
        assert!(dup_report.has_issues());
    }

    // --- missing types: CJS require-imports are not flagged ---

    #[test]
    fn cjs_require_namespace_import_not_flagged_for_missing_type() {
        // `const fs = require("node:fs")` — type comes from the module,
        // not from an annotation. Must NOT be flagged as missing a type.
        let deps = vec![cjs_dep(
            "index.cjs",
            "const fs = require(\"node:fs\");\nmodule.exports = fs;\n",
        )];
        let report = helpers::check_missing_types(deps);
        assert!(
            !report.has_issues(),
            "CJS require namespace import should not be flagged for missing type: {:?}",
            report.items
        );
    }

    #[test]
    fn cjs_require_destructured_import_not_flagged_for_missing_type() {
        // `const { readFileSync } = require("fs")` — destructured import.
        let deps = vec![cjs_dep(
            "index.cjs",
            "const { readFileSync } = require(\"node:fs\");\nmodule.exports = readFileSync;\n",
        )];
        let report = helpers::check_missing_types(deps);
        assert!(
            !report.has_issues(),
            "CJS destructured require import should not be flagged: {:?}",
            report.items
        );
    }

    #[test]
    fn cjs_require_member_access_not_flagged_for_missing_type() {
        // `const EventEmitter = require("node:events").EventEmitter`
        let deps = vec![cjs_dep(
            "index.cjs",
            "const EventEmitter = require(\"node:events\").EventEmitter;\nmodule.exports = EventEmitter;\n",
        )];
        let report = helpers::check_missing_types(deps);
        assert!(
            !report.has_issues(),
            "CJS member-access require import should not be flagged: {:?}",
            report.items
        );
    }

    #[test]
    fn real_untyped_cjs_variable_still_flagged() {
        // A real variable (not a require import) without a type → flagged.
        let deps = vec![cjs_dep(
            "index.cjs",
            "const count = 42;\nmodule.exports = count;\n",
        )];
        let report = helpers::check_missing_types(deps);
        assert!(report.has_issues());
    }
}
