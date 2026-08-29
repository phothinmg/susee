mod core;
pub use core::SuSeeConfig;
use napi_derive::napi;
use std::time::Instant;

/// Entry point exposed to Node.js. Delegates to the core build pipeline.
/// When `config` is `None`, the config is loaded from `susee.config.jsonc`.
#[napi]
pub fn susee_build(config: Option<SuSeeConfig>) {
    let start = Instant::now();
    core::build(config.as_ref());
    core::susee_log::build_time(start);
}
/// Entry point exposed to Node.js.
///
/// `args` should be `process.argv.slice(2)` — the user-supplied CLI args
/// with the Node executable and script path already stripped. The Rust
/// `susee_cli_build()` reads `std::env::args_os().skip(1)` which is correct
/// for the standalone binary but wrong under Node (where argv[0] is `node`
/// and argv[1] is the bin script), so we pass the args explicitly here.
#[napi]
pub fn cli_build(args: Vec<String>) {
    let start = Instant::now();
    core::susee_cli_build_with_args(args);
    core::susee_log::build_time(start);
}
#[napi]
pub fn susee_bundler(entry: &str) {
    let start = Instant::now();
    //   let bundled = core::
}
