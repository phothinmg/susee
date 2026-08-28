use colored::*;

pub fn error(info: &str, cause: &str, e: bool) {
    eprintln!("{}{}{}{}", "   ", "[", "susee_error".red().bold(), "]");
    eprintln!("{}{}{}{}", "     ", "info", "  : ", info);
    eprintln!("{}{}{}{}", "     ", "cause", " : ", cause);
    if e {
        std::process::exit(1)
    }
}

pub fn info(message: &str) {
    eprintln!("{}{}{}{}", "   ", "[", "susee_info".green().bold(), "]");
    eprintln!("{}{}", "     ", message);
}

pub fn warning(message: &str) {
    eprintln!("{}{}{}{}", "   ", "[", "susee_warning".yellow().bold(), "]");
    eprintln!("{}{}", "     ", message);
}
