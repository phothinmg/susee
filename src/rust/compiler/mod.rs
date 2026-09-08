mod emitters;
mod source_type;

pub use emitters::cjs::emit_cjs;
pub use emitters::dts::emit_dts;
pub use emitters::esm::emit_esm;
pub use emitters::js_dts::{TempPath,emit_js_dts};
pub use source_type::detect_source_type;

