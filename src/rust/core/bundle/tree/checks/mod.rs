pub mod check_installed;
pub mod helpers;

use crate::core::log;
use crate::core::bundle::types::DepsFile;
use colored::Colorize;

use helpers::{
    CheckReport, check_anonymous, check_default_exports, check_duplicates, check_undefined_usage,
};

/// Run the three hard-gate checks
fn check_default(dep_files: &[DepsFile]) -> Result<(), ()> {
    let reports: Vec<CheckReport> = vec![
        check_duplicates(dep_files),
        check_undefined_usage(dep_files),
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
/// Run the optional [`check_default_exports`] check and print its report.
///
/// Returns `Ok(())` when no `export default` statements were found, or
/// `Err(())` when at least one was reported.
fn check_opts_default_exports(dep_files: &[DepsFile]) -> Result<(), ()> {
    let reports: Vec<CheckReport> = vec![check_default_exports(dep_files)];

    let mut had_issue = false;
    for report in &reports {
        if report.has_issues() {
            print_report(report);
            had_issue = true;
        }
    }

    if had_issue { Err(()) } else { Ok(()) }
}
/// Run the optional [`check_anonymous`] check and print its report.
///
/// Returns `Ok(())` when no anonymous default exports were imported, or
/// `Err(())` when at least one was reported.
fn check_opts_anonymous(dep_files: &[DepsFile]) -> Result<(), ()> {
    let reports: Vec<CheckReport> = vec![check_anonymous(dep_files)];

    let mut had_issue = false;
    for report in &reports {
        if report.has_issues() {
            print_report(report);
            had_issue = true;
        }
    }

    if had_issue { Err(()) } else { Ok(()) }
}

// ---------------------------------------------------------------------------
// Run-checks
// ---------------------------------------------------------------------------

/// Entry point for the default (hard-gate) check run.
///
pub fn run_default_check(dep_files: &[DepsFile]) {
    println!("{}", "Running default checks…".cyan());
    match check_default(dep_files) {
        Ok(()) => {
            println!("{}", "No issues found in default checks ✓".green());
        }
        Err(()) => {
            let info = "Found issues that must be fixed before bundling.";
            let cause = "See the report above for file names, line positions, and \
                         suggested fixes. Each category that found issues must be \
                         resolved (or the declaration renamed to a named export).";
            log::error(info, cause, true);
        }
    }
}

/// Entry point for the optional `export default` check.
///
pub fn run_check_opts_default_exports(dep_files: &[DepsFile]) {
    println!("{}", "");
    println!("{}", "Running default_exports check…".cyan());
    match check_opts_default_exports(dep_files) {
        Ok(()) => {
            println!("{}", "No default_exports found ✓".green());
            println!("{}", "");
        }
        Err(()) => {
            let info = "Found default_exports that should be fixed before bundling.";
            let cause = "See the report above for file names, line positions, and suggested fixes.";
            log::error(info, cause, true);
        }
    }
}

/// Entry point for the optional anonymous-exports check.
///
pub fn run_check_opts_anonymous(dep_files: &[DepsFile]) {
    println!("{}", "");
    println!("{}", "Running default_exports check…".cyan());
    match check_opts_anonymous(dep_files) {
        Ok(()) => {
            println!("{}", "No anonymous found ✓".green());
            println!("{}", "");
        }
        Err(()) => {
            let info = "Found anonymous that should be fixed before bundling.";
            let cause = "See the report above for file names, line positions, and suggested fixes.";
            log::error(info, cause, true);
        }
    }
}
// ---------------------------------------------------------------------------
// Pretty-printing
// ---------------------------------------------------------------------------

/// Pretty-print a single [`CheckReport`] to stderr.
///
/// The header line shows the check kind label (red, bold), a human-readable
/// header (yellow, bold), and the total issue count. Each [`CheckItem`] is
/// then printed as a bullet point with its one-line message followed by any
/// indented detail lines.
fn print_report(report: &CheckReport) {
    let header = match report.kind {
        helpers::CheckKind::Duplicates => "Duplicated declarations",
        helpers::CheckKind::Anonymous => "Anonymous imports/exports",
        helpers::CheckKind::ExportDefault => "Export default usage",
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
