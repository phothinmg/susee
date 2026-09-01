//! Utility functions for the SUSEE project.

mod index;
mod unique_name;

#[allow(unused_imports)]
pub use index::make_dep;
pub use index::{
    detect_module_type, is_jsx_content, is_non_local_import, merge_content,
    merge_imports_statement, read_file, with_parsed_program, write_file,
};

pub use unique_name::{UniqueName, sigil};
