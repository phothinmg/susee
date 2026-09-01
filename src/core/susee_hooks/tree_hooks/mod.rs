//! Tree hooks — normalize export/import patterns across the dependency tree.
//!
//! - [`anonymous`] — name anonymous default exports and update importers.
//! - [`export_default`] — rename named default exports to unique identifiers.

pub mod anonymous;
pub mod export_default;
