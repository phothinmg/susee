use colored::*;
use std::time::Instant;

pub fn error(info: &str, cause: &str, e: bool) {
    eprintln!("{}{}{}{}", "   ", "[", "susee_error".red().bold(), "]");
    eprintln!("{}{}{}{}", "     ", "info", "  : ", info);
    eprintln!("{}{}{}{}", "     ", "cause", " : ", cause);
    if e {
        std::process::exit(1)
    }
}
#[allow(unused)]
pub fn info(message: &str) {
    eprintln!("{}{}{}{}", "   ", "[", "susee_info".green().bold(), "]");
    eprintln!("{}{}", "     ", message);
}

pub fn warning(message: &str) {
    eprintln!("{}{}{}{}", "   ", "[", "susee_warning".yellow().bold(), "]");
    eprintln!("{}{}", "     ", message);
}

pub fn bundle_time(start: Instant) {
    let elapsed = start.elapsed();
    let ms = elapsed.as_secs_f64() * 1000.0;
    eprintln!(
        "{}{}{}{}{}{}{}",
        "   ",
        "[",
        "susee_bundle_time".green().bold(),
        "]",
        " : ",
        format!("{ms:.1}"),
        "ms"
    );
}
