use std::ffi::OsStr;
use std::path::Path;
use std::process::Command;
use std::{env, fs};

fn get_extension_from_filename(filename: &str) -> Option<&str> {
    Path::new(filename).extension().and_then(OsStr::to_str)
}
/// Write `content` to `file_path`, creating parent directories as needed.
/// Mirrors `files.writeFile` (minus the delete-first step, which is
/// redundant because `fs::write` truncates).
pub fn write_file(file_path: &str, content: &str) -> std::io::Result<()> {
    let p = Path::new(file_path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(p, content)
}
pub fn generate_dts_with_tsc(
    source_code: &str,
    out_dir: &str,
    input_file: &str,
    stem: String,
    export_path: String,
) -> String {
    let cwd = env::current_dir().expect("Error");
    let temp_out = cwd.join(out_dir);
    let sub_dir = if export_path == "." {
        "main"
    } else {
        &export_path[2..]
    };
    let temp_out_dir = temp_out.join(sub_dir);
    let temp_input_file_path = Path::new(input_file);
    let temp_input_file_name = temp_input_file_path
        .file_name()
        .and_then(OsStr::to_str)
        .expect("Error");
    let input_file_path = temp_out_dir.join(Path::new(temp_input_file_name));

    let input_file_str = input_file_path.to_str().expect("Error");
    let temp_out_dir_str = temp_out_dir.to_str().expect("Error");
    let _ = write_file(input_file_str, &source_code);
    let status = Command::new("npx")
        .arg("tsc")
        .arg(input_file_str)
        .arg("--allowJs")
        .arg("--noCheck")
        .arg("--ignoreConfig")
        .arg("--declaration")
        .arg("--emitDeclarationOnly")
        .arg("--outDir")
        .arg(temp_out_dir_str)
        .status()
        .expect("Fail to generate dts");
    println!("Dts process exited with {}", status);
    let input_file_ext = get_extension_from_filename(input_file)
        .expect("Error")
        .to_string();
    let out_dts_file_name = if input_file_ext == "mjs" || input_file_ext == "mts" {
        format!("{stem}.d.mts")
    } else if input_file_ext == "cjs" || input_file_ext == "cts" {
        format!("{stem}.d.cts")
    } else {
        format!("{stem}.d.ts")
    };
    let out_dts_file_path = temp_out_dir.join(out_dts_file_name);
    let dts_code = fs::read_to_string(out_dts_file_path).expect("Error to read dts content");
    dts_code
}
