use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Owns the paths to a temporary bundle directory and its output file.
///
/// When a `TempPath` is dropped, the temp directory is removed automatically
/// (errors are reported to stderr but not propagated).
pub struct TempPath {
    temp_dir: PathBuf,
    temp_file_path: PathBuf,
}

impl TempPath {
    /// Path to the temporary directory (`.susee_temp`).
    // pub fn dir(&self) -> &Path {
    //     &self.temp_dir
    // }

    /// Path to the written temporary file.
    pub fn file(&self) -> &Path {
        &self.temp_file_path
    }

    /// Manually remove the temp directory. Returns `Ok(())` on success or the
    /// underlying I/O error. After this call the `TempPath` is still usable
    /// but the directory will be gone.
    pub fn cleanup(&self) -> std::io::Result<()> {
        if self.temp_dir.is_dir() {
            fs::remove_dir_all(&self.temp_dir)
        } else {
            Ok(())
        }
    }
}

impl Drop for TempPath {
    fn drop(&mut self) {
        if let Err(e) = self.cleanup() {
            if e.kind() != ErrorKind::NotFound {
                eprintln!("Failed to clean up temp directory: {e}");
            }
        }
    }
}

/// Write `source_code` to `<.susee_temp>/<base_name>`, recreating the temp
/// directory first.
///
/// Any pre-existing `.susee_temp` directory is removed before writing so
/// stale files don't accumulate. Returns a [`TempPath`] that auto-cleans on
/// drop.
///
/// # Errors
///
/// Returns an error if the directory cannot be created or the file cannot be
/// written.
fn write_temp_bundle_file(source_code: &str, base_name: &str) -> std::io::Result<TempPath> {
    let temp_dir = PathBuf::from(".susee_temp");
    let temp_file_path = temp_dir.join(base_name);

    // Remove a stale temp dir from a previous run, ignoring "not found".
    if temp_dir.is_dir() {
        match fs::remove_dir_all(&temp_dir) {
            Ok(()) => println!("Stale temp directory removed."),
            Err(e) if e.kind() == ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
    }

    fs::create_dir_all(&temp_dir)?;
    fs::write(&temp_file_path, source_code)?;

    Ok(TempPath {
        temp_dir,
        temp_file_path,
    })
}

fn js_dts(input_path: &str, out_dir: &str) {
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

pub fn emit_js_dts(source_code: &str, base_name: &str, out_dir: &str) {
    let temp_path = write_temp_bundle_file(source_code, base_name).unwrap();
    let _ = js_dts(temp_path.file().to_str().unwrap(), out_dir);
    let _ = temp_path.cleanup();
}
