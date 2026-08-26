//! Shared types for the bundler pipeline.
//!
//! Ported from the `@suseejs/type` definitions used by the TypeScript bundler.

/// A single name-mapping entry, mirroring `NamesSet` from `@suseejs/type`.
///
/// Maps a `base` identifier (from file `file`) to a `new_name`.
/// `is_ed` indicates the mapping was for an `export default`.
#[derive(Debug, Clone)]
pub struct NamesSet {
    pub base: String,
    pub file: String,
    pub new_name: String,
    #[allow(dead_code)]
    pub is_ed: bool,
}

/// A collection of [`NamesSet`] entries.
pub type NamesSets = Vec<NamesSet>;
