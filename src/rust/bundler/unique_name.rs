//! Unique name generator.
//!
//! Ported from `src/nodejs/bundler/lib/uniqueName.ts`.

use std::collections::HashMap;

/// A unique name generator that produces deterministic, collision-free names
/// by combining a per-key prefix with an incrementing counter.
///
/// Mirrors the `UniqueName` class in `uniqueName.ts`.
#[derive(Debug, Clone)]
pub struct UniqueName {
    /// Maps `key` → `(prefix, count)`.
    stored_prefix: HashMap<String, (String, usize)>,
}

impl Default for UniqueName {
    fn default() -> Self {
        Self::new()
    }
}

impl UniqueName {
    /// Create a new empty `UniqueName`.
    pub fn new() -> Self {
        Self {
            stored_prefix: HashMap::new(),
        }
    }

    /// Set or update the prefix for a key, mirroring `setPrefix`.
    ///
    /// If the key already exists, the prefix is updated and the count
    /// is incremented. Otherwise a fresh entry with count `0` is created.
    pub fn set_prefix(&mut self, key: &str, value: &str) -> &mut Self {
        match self.stored_prefix.get_mut(key) {
            Some((_prefix, count)) => {
                *count += 1;
                *self.stored_prefix.get_mut(key).unwrap() = (value.to_string(), *count);
            }
            None => {
                self.stored_prefix
                    .insert(key.to_string(), (value.to_string(), 0));
            }
        }
        self
    }

    /// Generate a unique name for `key` using `input` as the base, mirroring
    /// `getName`.
    ///
    /// Returns a string like `{prefix}{input}_{n}` where `n` is the
    /// incremented count, or `__susee__{input}_{n}` if no prefix is set.
    pub fn get_name(&mut self, key: &str, input: &str) -> String {
        let (prefix, count) = match self.stored_prefix.get(key) {
            Some((p, c)) => (p.clone(), *c),
            None => ("__susee__".to_string(), 0),
        };
        let n = count + 1;
        let name = format!("{prefix}{input}_{n}");
        self.stored_prefix.insert(key.to_string(), (prefix, n));
        name
    }

    /// Get the prefix for a key, mirroring `getPrefix`.
    pub fn get_prefix(&self, key: &str) -> Option<&str> {
        self.stored_prefix.get(key).map(|(p, _)| p.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unique_name() {
        let mut generator = UniqueName::new();
        generator.set_prefix("ExportDefault", "susee__exportDefault__");
        let n1 = generator.get_name("ExportDefault", "foo");
        assert_eq!(n1, "susee__exportDefault__foo_1");
        let n2 = generator.get_name("ExportDefault", "bar");
        assert_eq!(n2, "susee__exportDefault__bar_2");
    }
}
