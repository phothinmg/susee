//! Read and parse `package.json` dependency information.
//!
//! Ported from `deps/lib/packageInfo.ts`.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde_json::Value;

/// Information about a single dependency's entry in `node_modules/<dep>/package.json`.
#[derive(Debug, Clone, Default)]
pub struct DepMeta {
    pub r#type: Option<String>,
    pub main: Option<String>,
    pub module: Option<String>,
    pub types: Option<String>,
    pub exports: Option<Value>,
}

/// Information about a `@types/*` dependency.
#[derive(Debug, Clone, Default)]
pub struct TypeDepMeta {
    pub types: Option<String>,
    pub exports: Option<Value>,
}

/// Parsed `package.json` info for the project.
#[derive(Debug, Clone)]
pub struct PackageInfo {
    pub r#type: String,
    pub deps: BTreeMap<String, DepMeta>,
    pub type_deps: BTreeMap<String, TypeDepMeta>,
    /// All dependency names (dependencies + devDependencies), including `@types/*`.
    pub all: Vec<String>,
}

impl PackageInfo {
    /// Check whether `name` is a known project dependency.
    pub fn contains(&self, name: &str) -> bool {
        self.all.iter().any(|d| d == name)
    }
}

/// Read `package.json` from `root` and collect dependency metadata.
///
/// If `package.json` is missing or unreadable, returns an empty `PackageInfo`.
pub fn get_package_info(root: &Path) -> PackageInfo {
    let package_json_path = root.join("package.json");
    let node_modules_path = root.join("node_modules");

    let pkg: Value = match fs::read_to_string(&package_json_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
    {
        Some(v) => v,
        None => {
            return PackageInfo {
                r#type: String::new(),
                deps: BTreeMap::new(),
                type_deps: BTreeMap::new(),
                all: Vec::new(),
            };
        }
    };

    let pkg_type = pkg
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let deps_keys = collect_keys(&pkg, "dependencies");
    let dev_deps_keys = collect_keys(&pkg, "devDependencies");

    let mut all_deps: Vec<String> = deps_keys
        .iter()
        .chain(dev_deps_keys.iter())
        .cloned()
        .collect();
    all_deps.sort();
    all_deps.dedup();

    let dependencies: Vec<String> = all_deps.iter().filter(|d| !d.starts_with("@types/")).cloned().collect();
    let types_dependencies: Vec<String> =
        all_deps.iter().filter(|d| d.starts_with("@types/")).cloned().collect();

    let mut deps_map: BTreeMap<String, DepMeta> = BTreeMap::new();
    for dep in &dependencies {
        if dep == "typescript" {
            continue;
        }
        let pj_path = node_modules_path.join(dep).join("package.json");
        if let Some(dep_pkg) = read_json(&pj_path) {
            deps_map.insert(
                dep.clone(),
                DepMeta {
                    r#type: dep_pkg.get("type").and_then(Value::as_str).map(String::from),
                    main: dep_pkg.get("main").and_then(Value::as_str).map(String::from),
                    module: dep_pkg.get("module").and_then(Value::as_str).map(String::from),
                    types: dep_pkg.get("types").and_then(Value::as_str).map(String::from),
                    exports: dep_pkg.get("exports").cloned(),
                },
            );
        }
    }

    let mut type_deps_map: BTreeMap<String, TypeDepMeta> = BTreeMap::new();
    for dep in &types_dependencies {
        if dep == "@types/node" {
            continue;
        }
        let pj_path = node_modules_path.join(dep).join("package.json");
        if let Some(dep_pkg) = read_json(&pj_path) {
            type_deps_map.insert(
                dep.clone(),
                TypeDepMeta {
                    types: dep_pkg.get("types").and_then(Value::as_str).map(String::from),
                    exports: dep_pkg.get("exports").cloned(),
                },
            );
        }
    }

    PackageInfo {
        r#type: pkg_type,
        deps: deps_map,
        type_deps: type_deps_map,
        all: all_deps,
    }
}

fn collect_keys(pkg: &Value, field: &str) -> Vec<String> {
    pkg.get(field)
        .and_then(Value::as_object)
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default()
}

fn read_json(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}