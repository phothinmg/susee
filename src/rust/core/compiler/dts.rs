use std::process::Command;

fn emit_tsc_dts(input_path: &str, out_dir: &str) {
    let status = Command::new("npx")
        .arg("tsc")
        .arg(input_path)
        .arg("--allowJs")
        .arg("--ignoreConfig")
        .arg("--declaration")
        .arg("--emitDeclarationOnly")
        .arg("--outDir")
        .arg(out_dir)
        .status()
        .expect("Fail to generate dts");
    println!("Dts process exited with {}", status);
}
