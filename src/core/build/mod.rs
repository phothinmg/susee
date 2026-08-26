use crate::core::compiler::Compiler;
use crate::core::config::{
    SuSeeConfig, generate_build_options, get_susee_config_path, read_config_file,
};
use std::fs;
use std::time::Instant;

pub fn susee_build(config: &SuSeeConfig) -> Result<(), String> {
    let start = Instant::now();
    let build_options = generate_build_options(config)?;

    let mut compiler = Compiler::new(build_options);
    compiler
        .compile()
        .map_err(|e| format!("build failed: {e}"))?;

    let elapsed = start.elapsed().as_secs_f64();
    eprintln!("[Build]  {elapsed:.2}s");
    Ok(())
}

pub fn build(config: Option<&SuSeeConfig>) {
    if let Some(config) = config {
        if let Err(e) = susee_build(config) {
            eprintln!("[Error] : {e}");
            std::process::exit(1);
        }
    } else {
        let config_path = get_susee_config_path().expect("");
        if fs::exists(&config_path).is_ok() {
            let config_options = read_config_file(&config_path).expect("");
            if let Err(e) = susee_build(&config_options) {
                eprintln!("[Error] : {e}");
                std::process::exit(1);
            }
        } else {
            eprintln!("[Error] : no config file found and no config provided");
            std::process::exit(1);
        }
    }
}
