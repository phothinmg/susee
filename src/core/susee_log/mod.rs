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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn bundle_time_does_not_panic() {
        let start = Instant::now();
        // Just verify it doesn't panic and produces output.
        bundle_time(start);
    }

    #[test]
    fn warning_does_not_panic() {
        warning("test warning message");
    }

    #[test]
    fn info_does_not_panic() {
        info("test info message");
    }

    // Note: `error(info, cause, true)` calls `std::process::exit(1)` which
    // cannot be tested in-process. We test only the non-exiting variant.
    #[test]
    fn error_non_exit_does_not_panic() {
        error("test info", "test cause", false);
    }
}
