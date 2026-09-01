//! Verify that collected npm module specifiers are actually installed.
//!
//! An npm specifier is considered *installed* when either:
//!
//! 1. It is listed in the project's `package.json` (`dependencies` or
//!    `devDependencies`), **or**
//! 2. A corresponding directory exists under `node_modules/`.
//!
//! Specifiers that satisfy neither condition are reported as missing. When at
//! least one missing specifier is found, [`check_npm_installed`] logs an error
//! via [`susee_log::error`] and exits the process.
//!
//! Scoped packages (`@scope/name`) and subpath imports (`pkg/sub/path`) are
//! normalized to their root package name before checking.
use std::path::Path;

use super::package_info::PackageInfo;

/// Normalize an npm specifier to its root package name.
///
/// Examples:
/// - `react` → `react`
/// - `@scope/pkg` → `@scope/pkg`
/// - `@scope/pkg/sub/path` → `@scope/pkg`
/// - `react/jsx-runtime` → `react`
fn root_package_name(specifier: &str) -> &str {
    let s = specifier.trim_start_matches('/');
    if s.starts_with('@') {
        // Scoped package: `@scope/name[/sub...]`
        // The root package name is everything up to (but not including) the
        // second `/`, or the whole string if there is no second slash.
        let after_at = &s[1..];
        match after_at.find('/') {
            Some(first_slash) => {
                let after_scope = &after_at[first_slash + 1..];
                match after_scope.find('/') {
                    Some(second_slash) => {
                        // Include `@scope` + `/` + name up to second slash.
                        &s[..1 + first_slash + 1 + second_slash]
                    }
                    None => s, // `@scope/name` with no subpath
                }
            }
            None => s, // Malformed `@scope` without a name; return as-is.
        }
    } else {
        // Unscoped package: `name[/sub...]`
        match s.find('/') {
            Some(idx) => &s[..idx],
            None => s,
        }
    }
}

/// Check that every npm specifier in `npm_modules` is installed.
///
/// `pkg` is the parsed `package.json` info for the project rooted at `root`.
/// `root` is the project root directory (where `node_modules/` lives).
///
/// Returns `Ok(())` if all specifiers are installed, or `Err(())` if at least
/// one is missing. When missing specifiers are found, an error is logged via
/// [`susee_log::error`] with `exit = true`, which terminates the process.
pub fn check_npm_installed(
    npm_modules: &[String],
    pkg: &PackageInfo,
    root: &Path,
) -> Result<(), ()> {
    let node_modules = root.join("node_modules");
    let mut missing: Vec<String> = Vec::new();

    for specifier in npm_modules {
        let root_name = root_package_name(specifier);
        if root_name.is_empty() {
            continue;
        }

        let in_package_json = pkg.contains(root_name);
        let in_node_modules = node_modules.join(root_name).exists();

        if !in_package_json && !in_node_modules {
            missing.push(specifier.clone());
        }
    }

    if missing.is_empty() {
        Ok(())
    } else {
        let info = "Susee found npm dependencies that are not installed.";
        let cause = format!(
            "The following npm packages are imported but neither listed in \
             package.json nor present in node_modules:\n{}",
            missing
                .iter()
                .map(|m| format!("  - {m}"))
                .collect::<Vec<_>>()
                .join("\n")
        );
        crate::core::susee_log::error(info, &cause, true);
        // `susee_log::error` with `exit = true` terminates the process, so
        // this line is unreachable; it exists only to satisfy the return type.
        Err(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::super::package_info::get_package_info;
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    /// Helper: create a `node_modules/<name>/package.json` stub.
    fn install_pkg(root: &Path, name: &str) {
        let dir = root.join("node_modules").join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("package.json"),
            format!(r#"{{"name":"{name}","version":"0.0.0"}}"#),
        )
        .unwrap();
    }

    /// Helper: write a `package.json` with the given dependencies JSON.
    fn write_pkg(root: &Path, deps_json: &str) {
        fs::write(
            root.join("package.json"),
            format!(r#"{{"dependencies":{deps_json}}}"#),
        )
        .unwrap();
    }

    // -- root_package_name unit tests (pure, no fs) --------------------------

    #[test]
    fn root_name_unscoped() {
        assert_eq!(root_package_name("react"), "react");
    }

    #[test]
    fn root_name_unscoped_subpath() {
        assert_eq!(root_package_name("react/jsx-runtime"), "react");
    }

    #[test]
    fn root_name_scoped() {
        assert_eq!(root_package_name("@scope/pkg"), "@scope/pkg");
    }

    #[test]
    fn root_name_scoped_subpath() {
        assert_eq!(root_package_name("@scope/pkg/sub/path"), "@scope/pkg");
    }

    // -- check_npm_installed integration tests -------------------------------
    //
    // NOTE: `susee_log::error` with `exit = true` calls `std::process::exit`,
    // which cannot be tested in-process. The tests below exercise only the
    // *success* path (all installed) and rely on the structure of
    // `check_npm_installed` returning `Ok(())` without triggering the error
    // branch.

    #[test]
    fn check_ok_when_all_listed_in_package_json() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{"react":"^18.0.0"}"#);
        let pkg = get_package_info(root);

        let npm = vec!["react".to_string()];
        let result = check_npm_installed(&npm, &pkg, root);
        assert!(result.is_ok());
    }

    #[test]
    fn check_ok_when_all_in_node_modules() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{}"#);
        install_pkg(root, "react");
        let pkg = get_package_info(root);

        let npm = vec!["react".to_string()];
        let result = check_npm_installed(&npm, &pkg, root);
        assert!(result.is_ok());
    }

    #[test]
    fn check_ok_for_subpath_import_when_installed() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{"react":"^18.0.0"}"#);
        install_pkg(root, "react");
        let pkg = get_package_info(root);

        let npm = vec!["react/jsx-runtime".to_string()];
        let result = check_npm_installed(&npm, &pkg, root);
        assert!(result.is_ok());
    }

    #[test]
    fn check_ok_for_scoped_subpath_when_installed() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{"@scope/pkg":"^1.0.0"}"#);
        install_pkg(root, "@scope/pkg");
        let pkg = get_package_info(root);

        let npm = vec!["@scope/pkg/sub/path".to_string()];
        let result = check_npm_installed(&npm, &pkg, root);
        assert!(result.is_ok());
    }

    #[test]
    fn check_ok_when_node_modules_has_it_but_package_json_does_not() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{}"#);
        install_pkg(root, "left-pad");
        let pkg = get_package_info(root);

        let npm = vec!["left-pad".to_string()];
        let result = check_npm_installed(&npm, &pkg, root);
        assert!(result.is_ok());
    }

    #[test]
    fn check_ok_empty_npm_list() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        write_pkg(root, r#"{}"#);
        let pkg = get_package_info(root);

        let npm: Vec<String> = Vec::new();
        let result = check_npm_installed(&npm, &pkg, root);
        assert!(result.is_ok());
    }
}
