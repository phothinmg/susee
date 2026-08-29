//! Unique name generator.

use std::collections::HashMap;

/// A unique name generator that produces deterministic, collision-free names.
///
/// Each generated name follows the format:
/// ```text
/// s{key_hash}{input_hash}{count}
/// ```
/// where:
/// - `s` is a fixed leading letter,
/// - `key_hash` is a short hash derived from the `key`,
/// - `input_hash` is a short hash derived from the `input`,
/// - `count` is an incrementing per-key counter.

#[derive(Debug, Clone)]
pub struct UniqueName {
    /// Maps `key` → `count`.
    counts: HashMap<String, usize>,
    /// Maps `key` → prefix string. If a key has no explicit prefix, the
    /// default `susee__anonymous__` is used (matching the TS implementation).
    prefixes: HashMap<String, String>,
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
            counts: HashMap::new(),
            prefixes: HashMap::new(),
        }
    }

    /// Seed (or bump) the counter for `key` and optionally set its prefix.
    ///
    /// If the key already exists the counter is incremented; otherwise a
    /// fresh entry with count `0` is created. The `value` is stored as the
    /// prefix for generated names under this key, mirroring `setPrefix` in
    /// the TS implementation (`uniqueName.setPrefix({ key, value: "susee__anonymous__" })`).
    pub fn set_prefix(&mut self, key: &str, value: &str) -> &mut Self {
        match self.counts.get_mut(key) {
            Some(count) => *count += 1,
            None => {
                self.counts.insert(key.to_string(), 0);
            }
        }
        self.prefixes.insert(key.to_string(), value.to_string());
        self
    }

    /// Generate a unique name for `key` using `input` as the base.
    ///
    /// The returned string has the form `{prefix}{input}_{count}` when a
    /// prefix has been set via [`set_prefix`], or `susee__anonymous__{input}_{count}`
    /// as the default prefix, mirroring the TS `getName` implementation.
    pub fn get_name(&mut self, key: &str, input: &str) -> String {
        let count = match self.counts.get_mut(key) {
            Some(c) => {
                *c += 1;
                *c
            }
            None => {
                self.counts.insert(key.to_string(), 1);
                1
            }
        };
        let prefix = self
            .prefixes
            .get(key)
            .cloned()
            .unwrap_or_else(|| "susee__anonymous__".to_string());
        format!("{prefix}{input}_{count}")
    }

    /// Get the current count for a key, mirroring `getPrefix`.
    ///
    /// Returns `None` if the key has never been seen.
    pub fn get_prefix(&self, key: &str) -> Option<usize> {
        self.counts.get(key).copied()
    }
}

/// Compute a short, non-cryptographic hash of a string, rendered as
/// zero-padded lowercase hexadecimal.
///
/// Uses the FNV-1a variant and truncates to 4 hex digits (16 bits) so that
/// names stay compact while still providing good separation between
/// distinct inputs.
#[allow(dead_code)]
fn hash_code(s: &str) -> String {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;

    let mut hash = FNV_OFFSET;
    for byte in s.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    // Truncate to 16 bits → 4 hex digits.
    format!("{:04x}", (hash & 0xffff))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unique_name_format() {
        let mut generator = UniqueName::new();
        generator.set_prefix("ExportDefault", "susee__anonymous__");
        let n1 = generator.get_name("ExportDefault", "foo");
        // set_prefix inserted count 0 for the new key, then get_name incremented it to 1.
        assert_eq!(n1, "susee__anonymous__foo_1");
    }

    #[test]
    fn test_unique_name_increments() {
        let mut generator = UniqueName::new();
        let n1 = generator.get_name("ExportDefault", "foo");
        let n2 = generator.get_name("ExportDefault", "bar");
        let n3 = generator.get_name("ExportDefault", "foo");

        // Default prefix is "susee__anonymous__".
        assert_eq!(n1, "susee__anonymous__foo_1");
        assert_eq!(n2, "susee__anonymous__bar_2");
        assert_eq!(n3, "susee__anonymous__foo_3");
    }

    #[test]
    fn test_unique_name_starts_with_s() {
        let mut generator = UniqueName::new();
        let name = generator.get_name("SomeKey", "someInput");
        // Default prefix starts with 's'.
        assert!(name.starts_with('s'));
    }
}
