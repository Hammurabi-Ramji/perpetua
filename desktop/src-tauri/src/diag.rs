//! Minimal rolling diagnostics log. Release builds hide stdout/stderr on
//! Windows (`windows_subsystem = "windows"`), so without this every swallowed
//! error — a notification that failed to show, a backend that couldn't bind
//! its port, an SMTP relay that rejected a password-reset mail — vanished
//! silently and support had nothing to go on.
//!
//! Deliberately dependency-free: one append-only text file in the app data
//! directory, rolled to `.1` once it passes `MAX_BYTES`. Never logs secrets:
//! callers pass messages, not payloads.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

const LOG_FILE: &str = "perpetua.log";
const MAX_BYTES: u64 = 1024 * 1024;

pub fn log_path() -> PathBuf {
    crate::database::app_data_dir().join(LOG_FILE)
}

/// Appends one timestamped line. Best-effort: logging must never itself be a
/// failure path, so every error here is ignored.
pub fn log(message: &str) {
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > MAX_BYTES {
            let _ = fs::rename(&path, path.with_extension("log.1"));
        }
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%z");
        let _ = writeln!(file, "{stamp} {message}");
    }
    #[cfg(debug_assertions)]
    eprintln!("[perpetua] {message}");
}
