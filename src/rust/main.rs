use susee::cli::susee_cli_build;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    susee_cli_build(&args);
}
