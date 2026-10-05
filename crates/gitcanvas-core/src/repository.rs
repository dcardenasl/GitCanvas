//! Validated repository identity; live libgit2 handles never become shared state.

use std::path::{Path, PathBuf};

use git2::{Oid, Repository, RepositoryOpenFlags};
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
    /// Canonical absolute repository path.
    pub path: String,
    /// Repository directory name for display.
    pub name: String,
}

/// Parses a commit id received across the IPC boundary.
///
/// The one place ids are validated. `Oid::from_str` alone accepts an
/// abbreviation and silently pads it, so a short id would name a commit that
/// does not exist; requiring the full 40 hexadecimal digits keeps every command
/// answering the same question the same way.
///
/// # Errors
///
/// Returns [`AppError::InvalidInput`] unless `value` is a complete SHA-1.
pub(crate) fn parse_commit_id(value: &str) -> Result<Oid, AppError> {
    if value.len() != 40 {
        return Err(AppError::InvalidInput(
            "Expected a complete 40-character commit SHA".into(),
        ));
    }
    Oid::from_str(value).map_err(|_| AppError::InvalidInput("Invalid commit SHA".into()))
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

#[cfg(test)]
mod tests {
    use super::parse_commit_id;

    #[test]
    fn only_a_complete_hexadecimal_sha_is_accepted() {
        let full = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(parse_commit_id(full).unwrap().to_string(), full);
        assert!(parse_commit_id(&full.to_uppercase()).is_ok());

        for rejected in [
            "",
            "abc123",
            &full.chars().take(39).collect::<String>(),
            &format!("{full}0"),
            "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
        ] {
            assert!(parse_commit_id(rejected).is_err(), "accepted {rejected:?}");
        }
    }
}
