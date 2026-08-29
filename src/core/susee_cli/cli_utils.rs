use crate::core::susee_config::OutputFormat;
use std::path::Path;
use std::process::exit;

/// Print an error message tagged `[Error]` to stderr and exit with code 1.
///
/// Mirrors `fail(message)` from `fail.ts`. The tag is plain text instead of
/// magenta ANSI since the Rust CLI does not depend on a color crate yet.
pub fn fail(message: &str) -> ! {
    eprintln!("[Error] : {message}");
    exit(1);
}

pub fn print_help() {
    println!(
        r#"Susee CLI.

Usage:
  susee                                 Build using susee.config.{{ts,js,mjs}}
  susee init                            Generate susee.config.{{ts,js,mjs}}
  susee --help                          Show this message
  susee build <entry> [options]         Build from a single entry file

Options:
  --entry <path>                       Entry file (optional if provided as positional <entry>)
  --outdir <path>                      Output directory
  --format <cjs|commonjs|esm>          Output module format
  --tsconfig <path>                    Custom tsconfig path
  --allow-update[=true|false]          Enable/disable dependency update
  --warning[=true|false]               Treat dependency graph warnings as fatal
  --profile[=true|false]               Print bundler/compiler phase timings
  --minify[=true|false]                Minify output JavaScript code.

Notes:
  Duplicate top-level declarations fail the build with file and location output.
  Rename conflicting declarations in source files before bundling.

Examples:
  susee build src/index.ts --outdir dist
  susee build src/index.ts --format commonjs
  susee build --entry src/index.ts --format esm --tsconfig tsconfig.build.json
  susee build src/index.ts --profile
  susee --profile
"#
    );
}

/// Raw parsed options, mirroring `CliOptions` from `parse_argv.ts`.
#[derive(Debug, Clone, Default)]
pub struct CliOptions {
    pub entry: String,
    pub out_dir: Option<String>,
    pub format: Option<OutputFormat>,
    pub tsconfig: Option<String>,
    pub allow_update: Option<bool>,
    pub warning: Option<bool>,
    pub profile: Option<bool>,
    pub minify: Option<bool>,
}

/// Normalized build options for the CLI single-entry compiler, mirroring
/// `CliBuildOptions` from `parse_argv.ts`.
#[derive(Debug, Clone)]
pub struct CliBuildOptions {
    pub entry: String,
    pub out_dir: String,
    pub format: OutputFormat,
    pub tsconfig: Option<String>,
    pub allow_update: bool,
    pub minify: bool,
    pub warning: bool,
    #[allow(unused)]
    pub profile: bool,
}

/// `true` when `entry`'s extension is one susee accepts as an entry file.
/// Mirrors `isFile`.
fn is_file(entry: &str) -> bool {
    const EXTS: [&str; 6] = [".js", ".ts", ".mts", ".mjs", ".cjs", ".cts"];
    EXTS.iter().any(|ext| entry.ends_with(ext))
        && Path::new(entry)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| matches!(e, "js" | "ts" | "mts" | "mjs" | "cjs" | "cts"))
            .unwrap_or(false)
}

/// Parse a boolean flag value, failing the process on invalid input.
/// Mirrors `parseBooleanFlag`.
fn parse_boolean_flag(flag: &str, value: &str) -> bool {
    match value {
        "true" => true,
        "false" => false,
        _ => fail(&format!("Type of {flag} must be boolean.")),
    }
}

/// Parse the argv slice (without the program name) into [`CliOptions`].
///
/// Mirrors `parseArgs(argv)`.
pub fn parse_args(argv: &[String]) -> CliOptions {
    let mut opts = CliOptions::default();

    let mut i = 0;
    while i < argv.len() {
        let argument = &argv[i];

        // Positional first arg = entry.
        if i == 0 && !argument.starts_with("--") && is_file(argument) {
            opts.entry = argument.clone();
            i += 1;
            continue;
        }

        // Split `--flag=value` into (flag, inline_value).
        let (flag, inline_value) = match argument.split_once('=') {
            Some((f, v)) => (f, Some(v)),
            None => (argument.as_str(), None),
        };
        let next_value = argv.get(i + 1).map(|s| s.as_str());
        let value: Option<&str> = inline_value.or(next_value);

        match flag {
            "--entry" => {
                let Some(v) = value else {
                    fail("Entry point required.");
                };
                if v.starts_with("--") {
                    fail("Entry point required.");
                }
                if !opts.entry.is_empty() && is_file(&opts.entry) {
                    fail("Entry point already exists.");
                }
                opts.entry = v.to_string();
                if inline_value.is_none() {
                    i += 1;
                }
            }
            "--outdir" => {
                let Some(v) = value else {
                    fail("Output directory required.");
                };
                if v.starts_with("--") {
                    fail("Output directory required.");
                }
                opts.out_dir = Some(v.to_string());
                if inline_value.is_none() {
                    i += 1;
                }
            }
            "--format" => {
                let Some(v) = value else {
                    fail("Format must be cjs, commonjs, or esm.");
                };
                opts.format = Some(match v {
                    "cjs" | "commonjs" => OutputFormat::Commonjs,
                    "esm" => OutputFormat::Esm,
                    _ => fail("Format must be cjs, commonjs, or esm."),
                });
                if inline_value.is_none() {
                    i += 1;
                }
            }
            "--tsconfig" => {
                let Some(v) = value else {
                    fail("Tsconfig path required.");
                };
                if v.starts_with("--") {
                    fail("Tsconfig path required.");
                }
                opts.tsconfig = Some(v.to_string());
                if inline_value.is_none() {
                    i += 1;
                }
            }
            "--allow-update" => {
                opts.allow_update = Some(parse_bool_flag_value(
                    "allow update",
                    inline_value,
                    next_value,
                    &mut i,
                ));
            }
            "--minify" => {
                opts.allow_update = Some(parse_bool_flag_value(
                    "minify",
                    inline_value,
                    next_value,
                    &mut i,
                ));
            }
            "--warning" => {
                opts.warning = Some(parse_bool_flag_value(
                    "warning",
                    inline_value,
                    next_value,
                    &mut i,
                ));
            }
            "--profile" => {
                opts.profile = Some(parse_bool_flag_value(
                    "profile",
                    inline_value,
                    next_value,
                    &mut i,
                ));
            }
            _ => {
                // Unknown flag — mirror the TS parser, which silently ignores
                // unrecognized args. This keeps `susee build <entry> --unknown`
                // from erroring on forward-compat flags.
            }
        }
        i += 1;
    }

    if opts.entry.is_empty() {
        fail("Entry point required");
    }
    opts
}

/// Resolve the boolean value for a flag, handling all three forms
/// (`--flag`, `--flag=true`, `--flag true`). Advances `i` when a separate
/// value is consumed.
fn parse_bool_flag_value(
    flag: &str,
    inline_value: Option<&str>,
    next_value: Option<&str>,
    i: &mut usize,
) -> bool {
    if let Some(v) = inline_value {
        return parse_boolean_flag(flag, v);
    }
    if matches!(next_value, Some("true") | Some("false")) {
        let v = next_value.unwrap();
        *i += 1;
        return parse_boolean_flag(flag, v);
    }
    true
}

/// Apply defaults to produce [`CliBuildOptions`], mirroring
/// `getDefaultOptions(args)`.
pub fn get_default_options(args: &CliOptions) -> CliBuildOptions {
    CliBuildOptions {
        entry: args.entry.clone(),
        out_dir: args.out_dir.clone().unwrap_or_else(|| "dist".to_string()),
        format: args.format.unwrap_or_default(),
        tsconfig: args.tsconfig.clone(),
        allow_update: args.allow_update.unwrap_or(false),
        warning: args.warning.unwrap_or(false),
        profile: args.profile.unwrap_or(false),
        minify: args.minify.unwrap_or(false),
    }
}

/// Extract the `--profile` flag from a raw argv slice, returning the
/// remaining args and whether profiling is enabled.
///
/// Mirrors `extractProfileFlag` from `src/nodejs/cli/index.ts`. This is
/// used by the top-level dispatcher so `--profile` can appear before any
/// subcommand (e.g. `susee --profile build ...`).
pub fn extract_profile_flag(args: &[String]) -> (Vec<String>, bool) {
    let mut next_args: Vec<String> = Vec::with_capacity(args.len());
    let mut profile = false;

    let mut i = 0;
    while i < args.len() {
        let argument = &args[i];
        let (flag, inline_value) = match argument.split_once('=') {
            Some((f, v)) => (f, Some(v)),
            None => (argument.as_str(), None),
        };

        if flag != "--profile" {
            next_args.push(argument.clone());
            i += 1;
            continue;
        }

        if let Some(v) = inline_value {
            profile = parse_boolean_flag("profile", v);
            i += 1;
            continue;
        }
        let next_value = args.get(i + 1).map(|s| s.as_str());
        if matches!(next_value, Some("true") | Some("false")) {
            profile = parse_boolean_flag("profile", next_value.unwrap());
            i += 2;
            continue;
        }
        profile = true;
        i += 1;
    }

    (next_args, profile)
}
