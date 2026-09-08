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
    /// The history represented by a pagination cursor is no longer available.
    #[error("History changed: {0}")]
    StaleCursor(String),
    /// Background work could not complete.
    #[error("Background operation failed: {0}")]
    Internal(String),
}

impl From<git2::Error> for AppError {
    fn from(error: git2::Error) -> Self {
        Self::Git(error.message().to_owned())
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}
