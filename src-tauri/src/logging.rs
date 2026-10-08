//! Bounded structured diagnostics. Payloads and credentials are never log fields.

use std::path::Path;
use tracing_appender::{
    non_blocking::WorkerGuard,
    rolling::{RollingFileAppender, Rotation},
};

fn writer(directory: &Path) -> Result<RollingFileAppender, Box<dyn std::error::Error>> {
    std::fs::create_dir_all(directory)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("gitcanvas")
        .filename_suffix("jsonl")
        .max_log_files(7)
        .build(directory)?)
}

/// Installs daily JSON diagnostics; the application owns the flush guard.
///
/// # Errors
/// Returns filesystem or subscriber initialization failures at startup.
pub fn initialize(directory: &Path) -> Result<WorkerGuard, Box<dyn std::error::Error>> {
    let (writer, guard) = tracing_appender::non_blocking(writer(directory)?);
    tracing_subscriber::fmt()
        .json()
        .with_ansi(false)
        .with_max_level(tracing::Level::INFO)
        .with_writer(writer)
        .try_init()
        .map_err(std::io::Error::other)?;
    Ok(guard)
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    #[test]
    fn rotating_writer_creates_a_log_in_the_requested_directory() {
        let directory = tempfile::tempdir().unwrap();
        let mut writer = super::writer(directory.path()).unwrap();
        writer.write_all(b"{\"event\":\"test\"}\n").unwrap();
        writer.flush().unwrap();
        let files: Vec<_> = std::fs::read_dir(directory.path()).unwrap().collect();
        assert_eq!(files.len(), 1);
        let path = files[0].as_ref().unwrap().path();
        assert!(path
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with("gitcanvas"));
        assert_eq!(
            std::fs::read_to_string(path).unwrap(),
            "{\"event\":\"test\"}\n"
        );
    }
}
