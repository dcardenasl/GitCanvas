//! Stable, serializable failures shared by all application boundaries.

use serde::Serialize;
use specta::Type;

/// A domain failure, never a raw library error or a panic.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error, Serialize, Type)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    /// The supplied path does not identify a supported working repository.
    #[error("Invalid repository: {0}")]
    InvalidRepository(String),
    /// A filesystem operation failed.
    #[error("Filesystem operation failed: {0}")]
    Io(String),
    /// libgit2 could not complete an operation.
    #[error("Git operation failed: {0}")]
    Git(String),
    /// A request violates the public contract.
    #[error("Invalid request: {0}")]
    InvalidInput(String),
    /// A requested file would resolve outside the selected repository.
    #[error("Path is outside the repository: {0}")]
    PathOutsideRepository(String),
    /// The working tree changed while a local file was being read.
    #[error("Working tree changed while reading {0}")]
    WorktreeChanged(String),
    /// The requested local file cannot be represented by the selected source.
    #[error("Local file is unavailable: {0}")]
    WorktreeFileUnavailable(String),
    /// The operation would exceed an explicit resource budget.
    #[error("Resource limit exceeded: {0}")]
    ResourceLimitExceeded(String),
    /// The filesystem watcher is not available for this repository.
    #[error("Repository watcher is degraded: {0}")]
    WatchDegraded(String),
    /// The history represented by a pagination cursor is no longer available.
    #[error("History changed: {0}")]
    StaleCursor(String),
    /// The process ran out of file descriptors. Transient: retrying after other
    /// work has released its handles usually succeeds.
    #[error("The system ran out of open files: {0}")]
    ResourceExhausted(String),
    /// Background work could not complete.
    #[error("Background operation failed: {0}")]
    Internal(String),
}

impl AppError {
    /// Whether the same operation may succeed if simply tried again shortly.
    ///
    /// The single definition of "transient": callers decide whether to retry by
    /// asking the error, never by searching its message.
    #[must_use]
    pub fn is_transient(&self) -> bool {
        matches!(self, Self::ResourceExhausted(_))
    }
}

/// Whether an OS error means the process ran out of file descriptors:
/// `EMFILE` and `ENFILE` on Unix, `ERROR_TOO_MANY_OPEN_FILES` on Windows.
#[must_use]
pub fn is_descriptor_exhaustion(error: &std::io::Error) -> bool {
    if cfg!(windows) {
        error.raw_os_error() == Some(4)
    } else {
        matches!(error.raw_os_error(), Some(23 | 24))
    }
}

impl From<git2::Error> for AppError {
    fn from(error: git2::Error) -> Self {
        // libgit2 flattens the OS error into text, so this is the one place a
        // message is inspected; everything downstream matches on the variant.
        if error.class() == git2::ErrorClass::Os && error.message().contains("Too many open files")
        {
            Self::ResourceExhausted(error.message().to_owned())
        } else {
            Self::Git(error.message().to_owned())
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        if is_descriptor_exhaustion(&error) {
            Self::ResourceExhausted(error.to_string())
        } else {
            Self::Io(error.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn descriptor_exhaustion_is_transient_and_other_failures_are_not() {
        let exhausted = std::io::Error::from_raw_os_error(if cfg!(windows) { 4 } else { 24 });
        assert!(AppError::from(exhausted).is_transient());

        let missing = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert!(!AppError::from(missing).is_transient());
        assert!(!AppError::Git("nope".into()).is_transient());
    }

    #[test]
    fn libgit2_os_errors_about_descriptors_are_transient() {
        let error = git2::Error::new(
            git2::ErrorCode::GenericError,
            git2::ErrorClass::Os,
            "failed to open file: Too many open files",
        );
        assert!(AppError::from(error).is_transient());

        let unrelated = git2::Error::new(
            git2::ErrorCode::GenericError,
            git2::ErrorClass::Os,
            "permission denied",
        );
        assert!(!AppError::from(unrelated).is_transient());
    }
}
