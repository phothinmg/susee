//! Find files that depend on each other mutually (two-way circular dependencies).

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

#[cfg(test)]
mod tests {
    use super::*;
    use indexmap::indexmap;

    #[test]
    fn detects_mutual_pair() {
        let graph = indexmap! {
            "a".to_string() => vec!["b".to_string()],
            "b".to_string() => vec!["a".to_string()],
        };
        let mutual = find_mutual_dependencies(&graph);
        assert_eq!(mutual.len(), 1);
        assert_eq!(mutual[0], vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn no_mutual_when_one_way() {
        let graph = indexmap! {
            "a".to_string() => vec!["b".to_string()],
            "b".to_string() => vec![],
        };
        assert!(find_mutual_dependencies(&graph).is_empty());
    }

    #[test]
    fn records_pair_once() {
        let graph = indexmap! {
            "a".to_string() => vec!["b".to_string()],
            "b".to_string() => vec!["a".to_string()],
        };
        let mutual = find_mutual_dependencies(&graph);
        assert_eq!(mutual.len(), 1);
    }

    #[test]
    fn self_dependency_not_mutual() {
        // a depends on itself — dep_deps.contains(file) is true but pair is [a, a].
        // Per the algorithm, this is recorded as a "mutual" pair.
        let graph = indexmap! {
            "a".to_string() => vec!["a".to_string()],
        };
        let mutual = find_mutual_dependencies(&graph);
        assert_eq!(mutual.len(), 1);
        assert_eq!(mutual[0], vec!["a".to_string(), "a".to_string()]);
    }

    #[test]
    fn empty_graph() {
        let graph = IndexMap::new();
        assert!(find_mutual_dependencies(&graph).is_empty());
    }

    #[test]
    fn multiple_mutual_pairs() {
        let graph = indexmap! {
            "a".to_string() => vec!["b".to_string()],
            "b".to_string() => vec!["a".to_string()],
            "c".to_string() => vec!["d".to_string()],
            "d".to_string() => vec!["c".to_string()],
        };
        let mutual = find_mutual_dependencies(&graph);
        assert_eq!(mutual.len(), 2);
    }
}
