//! Utility functions for the SUSEE project.

mod index;
mod unique_name;

pub use index::{
    apply_renames, collect_root_bindings, collect_top_level_declaration_names, detect_module_type,
    extract_default_name, extract_import_clause, extract_module_path, extract_string_literal,
    is_jsx_content, is_non_local_import, make_dep, merge_content, merge_imports_statement,
    path_relative, read_file, with_parsed_program, write_file,
};

pub use unique_name::{UniqueName, sigil};
