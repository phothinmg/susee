use susee::core::susee_build::build;

fn main() {
    // let bundled_content = bundler("__local__/ts/index.ts", ".").expect("ERROR");
    // std::fs::write("__local__/bundled.ts", bundled_content).ok();
    build(None);
}
