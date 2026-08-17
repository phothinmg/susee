use susee::api::build_from_config_file;

fn main() {
    // Programmatic build from `susee.config.json` in the current directory.
    // Pass `Some("path")` to use an explicit config file path.
    if let Err(e) = build_from_config_file(None) {
        eprintln!("[Error] : {e}");
        std::process::exit(1);
    }
}
