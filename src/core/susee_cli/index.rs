//! CLI entry points for the `susee` command.
//!
//! Mirrors `index.ts` from the TypeScript implementation.
//!
//! # Subcommands
//!
//! | Command         | Description                              |
//!|-----------------|------------------------------------------|
//!| `susee`         | Run build with config from cwd.          |
//!| `susee build`   | Run build with explicit entry/options.   |
//!| `susee init`    | Create a `susee.config.jsonc` template.  |
//!| `susee -v`      | Print version.                           |
//!| `susee -h`      | Print help.                              |
//!
//! [`susee_cli_build`] reads `std::env::args()` (for the standalone binary);
//! [`susee_cli_build_with_args`] accepts an explicit `Vec<String>` (for the
//! napi binding, where `process.argv` includes the Node executable).

use std::path::PathBuf;

use super::cli_options::cli_compiler_build;
use super::cli_utils::{extract_profile_flag, fail, get_default_options, parse_args, print_help};

use crate::core::susee_build::build;

/// Read the package version from `package.json` in the current directory,
/// mirroring the `pkg.version` import in `index.ts`.
fn package_version() -> String {
    let pkg_path = PathBuf::from("package.json");
    match std::fs::read_to_string(&pkg_path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|v| v.get("version").and_then(|v| v.as_str()).map(String::from))
    {
        Some(v) => v,
        None => "unknown".to_string(),
    }
}

/// Set the `SUSEE_PROFILE` env var, mirroring `setProfileEnabled(true)`.
///
/// `std::env::set_var` / `remove_var` are `unsafe` in edition 2024 because
/// mutating the environment can race with concurrent reads. The CLI runs
/// single-threaded before any bundler work begins, so this is safe here.
fn set_profile_enabled(enabled: bool) {
    if enabled {
        // SAFETY: single-threaded CLI startup, before any threads spawned.
        unsafe { std::env::set_var("SUSEE_PROFILE", "1") };
    } else {
        // SAFETY: single-threaded CLI startup, before any threads spawned.
        unsafe { std::env::remove_var("SUSEE_PROFILE") };
    }
}

/// Template for `susee init`, mirroring `tsFileText` / `jsFileText` from
/// `index.ts` but in JSON form (since the Rust CLI reads JSON configs).
///
/// The field names match the Rust `SuSeeConfig` / `EntryPoint` structs:
/// - Per-entry: `minify`, `checkAnonymous`, `checkDefaultExports`
/// - Top-level: `entryPoints`, `outDir`, `allowUpdatePackageJson`
const CONFIG_TEMPLATE: &str = r#"{
  // Entry points to bundle
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm", "commonjs"],
      "tsconfigFilePath": null,
      "minify": true,
      "checkDefaultExports": false,
      "checkAnonymous": false
    }
  ],
  // Output directory (default: "dist")
  "outDir": "dist",
  // Update package.json fields from build output (default: false)
  "allowUpdatePackageJson": false
}
"#;

/// Generate a `susee.config.jsonc` file in the current directory.
///
pub fn cli_init() {
    let config_path = PathBuf::from("susee.config.jsonc");
    if config_path.exists() {
        fail("susee.config.jsonc already exists in the current directory");
    }
    if let Err(e) = std::fs::write(&config_path, CONFIG_TEMPLATE) {
        fail(&format!("failed to write susee.config.jsonc: {e}"));
    }
    println!("Done! Susee config file susee.config.jsonc is created at project root");
}
#[allow(unused)]
/// Top-level CLI entry point.
///
/// Mirrors `suseeCliBuild()` from `index.ts`. Reads the raw argv from
/// `std::env::args()` (like Node.js `process.argv`), skips the program name,
/// and dispatches to the appropriate subcommand.
pub fn susee_cli_build() {
    // `std::env::args()` panics if any argument contains invalid Unicode; use
    // `args_os` + `to_string_lossy` to be robust in that rare case.
    let raw_args: Vec<String> = std::env::args_os()
        .skip(1) // skip the program name, like `process.argv.slice(2)`
        .map(|s| s.to_string_lossy().into_owned())
        .collect();
    susee_cli_build_with_args(raw_args);
}

/// Top-level CLI entry point with explicit args.
///
/// Used by the Node.js (napi) binding where `process.argv` includes both
/// the Node executable and the script path, so `std::env::args().skip(1)`
/// would be incorrect. The JS side passes `process.argv.slice(2)` here.
pub fn susee_cli_build_with_args(raw_args: Vec<String>) {
    let (args, profile) = extract_profile_flag(&raw_args);
    if profile {
        set_profile_enabled(true);
    }

    if args.is_empty() {
        build(None);
        return;
    }

    if args.len() == 1 {
        match args[0].as_str() {
            "--version" | "-v" => {
                println!("susee v{}", package_version());
                return;
            }
            "--help" | "-h" => {
                print_help();
                return;
            }
            "init" => {
                cli_init();
                return;
            }
            "build" => {
                // `susee build` with no further args → show help (matches TS).
                print_help();
                return;
            }
            _ => {
                fail("Unknown CLI usage");
            }
        }
    }

    // `susee build --help` / `susee build -h` / `susee --help <anything>` etc.
    // (Bug 10 fix: original `args.len() == 1 && ... || ...` had precedence
    //  issues and the len==1 case was already handled above — this is dead
    //  code. The real `build -h` path is the `args.len() > 1 && args[0] ==
    //  "build"` branch below, which `parse_args` handles.)
    let has_help = args.iter().any(|a| a == "--help" || a == "-h");
    if has_help {
        print_help();
        return;
    }

    // `susee build <entry> [options]`
    if args.len() > 1 && args[0] == "build" {
        let raw = parse_args(&args[1..]);
        let options = get_default_options(&raw);
        cli_compiler_build(&options);
        return;
    }

    fail("Unknown CLI usage");
}
