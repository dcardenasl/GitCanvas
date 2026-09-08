//! Validated repository identity; live libgit2 handles never become shared state.

use std::path::{Path, PathBuf};

use git2::{Repository, RepositoryOpenFlags};
use serde::Serialize;
use specta::Type;

use crate::error::AppError;

/// A working repository whose canonical root was validated at construction.
///
/// Private fields and the absence of `Deserialize` prevent unchecked construction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveRepo {
    path: PathBuf,
}

/// Displayable repository identity, safe to send across IPC.
#[derive(Debug, Clone, Serialize, Type)]
pub struct RepositoryInfo {
    pub path: String,
    pub name: String,
}

impl ActiveRepo {
    /// Validates a working-tree root, including linked worktrees and submodules.
    ///
    /// # Errors
    /// Rejects nonexistent paths, bare repositories, descendants of a root, and
    /// malformed `.git` entries. No parent-directory discovery is performed.
    pub fn validate(path: impl AsRef<Path>) -> Result<Self, AppError> {
        let path = path.as_ref().canonicalize().map_err(|error| {
            AppError::InvalidRepository(format!("Cannot resolve repository path: {error}"))
        })?;
        if !path.is_dir() || !path.join(".git").exists() {
            return Err(AppError::InvalidRepository(
                "Choose a working-tree root containing .git".into(),
            ));
        }
        let repo = Self { path };
        repo.open()?;
        Ok(repo)
    }

    /// Returns the canonical working-tree root.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Opens an independent handle, rechecking identity after filesystem changes.
    ///
    /// # Errors
    /// Returns an error if the repository disappeared or no longer matches its root.
    pub fn open(&self) -> Result<Repository, AppError> {
        let repository = Repository::open_ext(
            &self.path,
            RepositoryOpenFlags::NO_SEARCH,
            std::iter::empty::<&Path>(),
        )
        .map_err(|error| AppError::InvalidRepository(error.message().to_owned()))?;
        let workdir = repository.workdir().ok_or_else(|| {
            AppError::InvalidRepository("Bare repositories are not supported".into())
        })?;
        if workdir.canonicalize()? != self.path {
            return Err(AppError::InvalidRepository(
                "Repository working directory does not match the selected path".into(),
            ));
        }
        Ok(repository)
    }

    /// Returns the validated identity for display, rejecting lossy path conversion.
    ///
    /// # Errors
    /// Non-Unicode roots cannot round-trip through the JSON IPC path contract.
    pub fn info(&self) -> Result<RepositoryInfo, AppError> {
        let path = self.path.to_str().ok_or_else(|| {
            AppError::InvalidRepository("Repository path must be valid Unicode".into())
        })?;
        Ok(RepositoryInfo {
            path: path.into(),
            name: self
                .path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(path)
                .into(),
        })
    }
}
