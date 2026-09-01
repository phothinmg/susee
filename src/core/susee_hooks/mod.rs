//! Tree-shaking and bundling hooks for the susee bundler.
//!

mod post_process_hooks;
mod pre_process_hooks;
mod remove_handler;
mod tree_hooks;

pub use post_process_hooks::minify_js;
pub use pre_process_hooks::unused_code::clean;
pub use remove_handler::remove_handler;
pub use tree_hooks::anonymous::anonymous_handler;
pub use tree_hooks::export_default::export_default_handler;
