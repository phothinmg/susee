mod config_types;
mod ts_options;
// susee config
pub use config_types::BuildEntryPoint;
pub use config_types::BuildOptions;
pub use config_types::OutputFormat;
pub use config_types::SuSeeConfig;
pub use config_types::generate_build_options;
pub use config_types::get_susee_config_path;
pub use config_types::read_config_file;
// ts options
pub use ts_options::CompilerOptions;
pub use ts_options::ModuleKind;
pub use ts_options::get_compiler_options;
