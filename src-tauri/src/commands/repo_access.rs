//! In-memory allowlist for repository operations crossing the IPC boundary.

use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use gitcanvas_core::{error::AppError, repository::ActiveRepo};

/// Repositories explicitly opened by the user or selected by startup/clone flow.
#[derive(Clone, Default)]
pub struct AllowedRepos(Arc<Mutex<HashSet<PathBuf>>>);

impl AllowedRepos {
    /// Adds a validated repository to the process-local allowlist.
    pub fn allow(&self, repository: &ActiveRepo) -> Result<(), AppError> {
        self.0
            .lock()
            .map_err(|_| AppError::Internal("repository allowlist was poisoned".to_owned()))?
            .insert(repository.path().to_path_buf());
        Ok(())
    }
}

/// Opens a repository only after confirming its canonical path was authorized.
pub fn with_repo<T>(
    allowed: &AllowedRepos,
    path: &str,
    operation: impl FnOnce(&ActiveRepo) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let canonical = PathBuf::from(path).canonicalize().map_err(|error| {
        AppError::InvalidRepository(format!("Cannot resolve repository path: {error}"))
    })?;
    let is_allowed = allowed
        .0
        .lock()
        .map_err(|_| AppError::Internal("repository allowlist was poisoned".to_owned()))?
        .contains(&canonical);
    if !is_allowed {
        return Err(AppError::InvalidRepository(
            "Repository has not been opened by this application".to_owned(),
        ));
    }
    operation(&ActiveRepo::validate(canonical)?)
}

#[cfg(test)]
mod tests {
    use super::{with_repo, AllowedRepos};
    use git2::Repository;
    use gitcanvas_core::{error::AppError, repository::ActiveRepo};

    #[test]
    fn arbitrary_valid_repositories_are_rejected_until_authorized() {
        let directory = tempfile::tempdir().unwrap();
        Repository::init(directory.path()).unwrap();
        let allowed = AllowedRepos::default();
        let called = std::cell::Cell::new(false);

        let result = with_repo(&allowed, directory.path().to_str().unwrap(), |_| {
            called.set(true);
            Ok(())
        });

        assert!(matches!(result, Err(AppError::InvalidRepository(_))));
        assert!(!called.get());
    }

    #[test]
    fn authorized_repositories_are_opened_through_the_shared_helper() {
        let directory = tempfile::tempdir().unwrap();
        Repository::init(directory.path()).unwrap();
        let repository = ActiveRepo::validate(directory.path()).unwrap();
        let allowed = AllowedRepos::default();
        allowed.allow(&repository).unwrap();

        let path = repository.path().to_str().unwrap();
        let info = with_repo(&allowed, path, ActiveRepo::info).unwrap();

        assert_eq!(info.path, path);
    }

    #[cfg(unix)]
    #[test]
    fn aliases_are_canonicalized_before_allowlist_lookup() {
        use std::os::unix::fs::symlink;

        let directory = tempfile::tempdir().unwrap();
        let alias_parent = tempfile::tempdir().unwrap();
        Repository::init(directory.path()).unwrap();
        let repository = ActiveRepo::validate(directory.path()).unwrap();
        let allowed = AllowedRepos::default();
        allowed.allow(&repository).unwrap();
        let alias = alias_parent.path().join("repo-alias");
        symlink(directory.path(), &alias).unwrap();

        assert!(with_repo(&allowed, alias.to_str().unwrap(), ActiveRepo::info).is_ok());
    }
}
