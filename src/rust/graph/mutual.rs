//! Find files that depend on each other mutually (two-way circular dependencies).
//!
//! Ported from `deps/lib/mutual.ts`.

use indexmap::IndexMap;

/// Find mutually-dependent file pairs.
///
/// Returns pairs `[a, b]` where `a` depends on `b` and `b` depends on `a`.
/// Each unordered pair is recorded only once.
pub fn find_mutual_dependencies(dep_obj: &IndexMap<String, Vec<String>>) -> Vec<Vec<String>> {
    let mut mutual_deps: Vec<Vec<String>> = Vec::new();

    for (file, dependencies) in dep_obj.iter() {
        for dep in dependencies {
            if let Some(dep_deps) = dep_obj.get(dep)
                && dep_deps.contains(file)
            {
                // Check if this mutual dependency is already recorded (either order)
                let exists = mutual_deps.iter().any(|pair| {
                    (&pair[0] == file && &pair[1] == dep) || (&pair[0] == dep && &pair[1] == file)
                });
                if !exists {
                    mutual_deps.push(vec![file.clone(), dep.clone()]);
                }
            }
        }
    }

    mutual_deps
}
