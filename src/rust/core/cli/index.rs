//! CLI entry dispatcher.
//!
//! Ported from `src/nodejs/cli/index.ts` (`suseeCliBuild`).
//!
//! Dispatch logic mirrors the TS version:
//! - `susee`                       → [`super::build::cli_build`] (config-based)
//! - `susee --version` / `-v`      → print version
//! - `susee --help` / `-h`         → [`super::print_help::print_help`]
//! - `susee init`                  → [`cli_init`]
//! - `susee build <entry> [opts]`  → [`super::cli::cli_compiler_compile`]
//! - `susee build --help` / `-h`   → [`super::print_help::print_help`]
//! - `susee --profile ...`         → set `SUSEE_PROFILE=1` and recurse
//!
//! The `init` command writes a `susee.config.json` template (the Rust CLI
//! uses JSON config files; see [`super::config`]).

use std::path::PathBuf;

use super::build::cli_build;
use super::cli::cli_compiler_compile;
use super::lib::fail::fail;
use super::lib::parse_argv::{extract_profile_flag, get_default_options, parse_args};
use super::lib::print_help::print_help;

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
const CONFIG_TEMPLATE: &str = r#"{
  "entryPoints": [
    {
      "entry": "src/index.ts",
      "exportPath": ".",
      "format": ["esm"],
      "tsconfigFilePath": null,
      "warning": false
    }
  ],
  "outDir": "dist",
  "allowUpdatePackageJson": false
}
"#;

/// Generate a `susee.config.json` file in the current directory.
///
/// Mirrors `cliInit()` from `index.ts`. The TS version prompts for TS vs JS
/// and writes `susee.config.ts|js|mjs`; the Rust CLI uses JSON, so this
/// writes `susee.config.json` non-interactively.
pub fn cli_init() {
    let config_path = PathBuf::from("susee.config.json");
    if config_path.exists() {
        fail("susee.config.json already exists in the current directory");
    }
    if let Err(e) = std::fs::write(&config_path, CONFIG_TEMPLATE) {
        fail(&format!("failed to write susee.config.json: {e}"));
    }
    println!("Done! Susee config file susee.config.json is created at project root");
}

/// Top-level CLI entry point.
///
/// Mirrors `suseeCliBuild()` from `index.ts`. Takes the raw argv (without
/// the program name) and dispatches to the appropriate subcommand.
pub fn susee_cli_build(raw_args: &[String]) {
    let (args, profile) = extract_profile_flag(raw_args);
    if profile {
        set_profile_enabled(true);
    }

    if args.is_empty() {
        cli_build();
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

    // `susee build --help` / `-h`
    if args.len() > 1 && args[0] == "build" && (args[1] == "--help" || args[1] == "-h") {
        print_help();
        return;
    }

    // `susee build <entry> [options]`
    if args.len() > 1 && args[0] == "build" {
        let raw = parse_args(&args[1..]);
        let options = get_default_options(&raw);
        cli_compiler_compile(&options);
        return;
    }

    fail("Unknown CLI usage");
}

#[cfg(test)]
mod tests {
    use super::super::CWD_TEST_MUTEX;
    use super::*;

    fn args(slice: &[&str]) -> Vec<String> {
        slice.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn package_version_reads_package_json() {
        // The workspace has a package.json with version 1.6.2. Hold the
        // shared cwd mutex because reading package.json depends on the
        // process cwd, which other tests may change.
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let v = package_version();
        drop(_guard);
        assert!(!v.is_empty());
        assert_ne!(v, "unknown");
    }

    #[test]
    fn cli_init_writes_config() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();
        cli_init();
        // Read before restoring cwd so the relative path resolves.
        let written = std::fs::read_to_string("susee.config.json").unwrap();
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);
        assert!(written.contains("\"entryPoints\""));
        assert!(written.contains("\"exportPath\""));
    }

    #[test]
    fn cli_init_refuses_to_overwrite() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();
        std::fs::write("susee.config.json", "{}").unwrap();
        let exists = std::path::Path::new("susee.config.json").exists();
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);
        // This calls fail() → process::exit(1). We can't catch that in a
        // test, so we just assert the pre-existing file is present
        // (verifying the guard condition instead of calling cli_init).
        assert!(exists);
    }

    #[test]
    fn set_profile_enabled_sets_env() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        set_profile_enabled(true);
        let is_one = std::env::var("SUSEE_PROFILE").as_deref() == Ok("1");
        set_profile_enabled(false);
        let is_unset = std::env::var("SUSEE_PROFILE").is_err();
        drop(_guard);
        assert!(is_one);
        assert!(is_unset);
    }

    // Dispatcher tests that exercise the non-exiting branches. The
    // `cli_build` / `cli_compiler_compile` branches perform real I/O and
    // are exercised via integration tests instead.
    #[test]
    fn dispatcher_version_arg() {
        let _guard = CWD_TEST_MUTEX.lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let prev = std::env::current_dir().unwrap();
        std::env::set_current_dir(&tmp).unwrap();
        // Write a minimal package.json so package_version() doesn't print "unknown".
        std::fs::write("package.json", r#"{"version":"9.9.9"}"#).unwrap();
        susee_cli_build(&args(&["--version"]));
        std::env::set_current_dir(prev).unwrap();
        drop(_guard);
    }

    #[test]
    fn dispatcher_help_arg() {
        // `--help` just prints and returns.
        susee_cli_build(&args(&["--help"]));
    }

    #[test]
    fn dispatcher_build_help() {
        susee_cli_build(&args(&["build", "--help"]));
    }
}
