//! The repositories the interface currently holds open.
//!
//! The clone cache evicts the least recently used clone when it is over budget.
//! Which clones are in use is a fact about the interface (its open tabs), so the
//! interface reports it here and retention consults it, instead of every
//! command that might evict guessing from whatever path it was last handed.
//!
//! The interface sends its **complete** set each time rather than "opened X" and
//! "closed Y". A set cannot drift out of step with the interface after a missed
//! or repeated message, and an idempotent replacement is safe to retry.
//!
//! Requests are numbered by the interface. They reach the backend on blocking
//! threads and could be applied out of order; a request older than the one
//! already applied is ignored, so a late arrival can never roll the set back and
//! leave a tab unprotected.

use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use gitcanvas_core::{
    error::AppError,
    github::cache,
    workspace::{MAX_PATH_BYTES, MAX_TABS},
};
use serde::Deserialize;
use specta::Type;

use super::runtime::read;

/// The interface's complete set of open repositories at one moment.
#[derive(Debug, Clone, Deserialize, Type)]
pub struct OpenRepositoriesRequest {
    /// Increases with every request. A request no newer than the last one applied
    /// is ignored, so one that arrives late cannot undo a newer report.
    pub revision: u32,
    /// Working-tree roots of the open tabs, in any form that resolves to them.
    pub paths: Vec<String>,
}

#[derive(Default)]
struct Registry {
    /// The revision last applied, or `None` before the first request.
    revision: Option<u32>,
    /// Newest received report, including one still waiting for a runtime permit.
    desired: Option<u32>,
    /// Canonical roots, which is what makes aliases of one repository equal.
    paths: BTreeSet<PathBuf>,
}

/// Process-local record of which repositories are open as tabs.
#[derive(Clone, Default)]
pub struct OpenRepos(Arc<Mutex<Registry>>);

fn poisoned() -> AppError {
    AppError::Internal("the open repositories registry was poisoned".to_owned())
}

impl OpenRepos {
    /// Replaces the set unless a newer request was already applied.
    ///
    /// Returns whether the set changed hands, which is `false` for a stale or
    /// repeated revision.
    fn requested(&self, revision: u32) -> Result<(), AppError> {
        let mut registry = self.0.lock().map_err(|_| poisoned())?;
        registry.desired = Some(registry.desired.map_or(revision, |held| held.max(revision)));
        Ok(())
    }

    fn replace(&self, revision: u32, paths: BTreeSet<PathBuf>) -> Result<bool, AppError> {
        let mut registry = self.0.lock().map_err(|_| poisoned())?;
        if registry.revision.is_some_and(|applied| revision <= applied) {
            return Ok(false);
        }
        registry.desired = Some(registry.desired.map_or(revision, |held| held.max(revision)));
        registry.revision = Some(revision);
        registry.paths = paths;
        Ok(true)
    }

    /// Names of the cache entries under `cache_root` that an open tab uses.
    ///
    /// Repositories outside the cache contribute nothing: the user's own
    /// folders are not the cache's to protect or evict.
    ///
    /// # Errors
    /// Returns an error for a pending report, unresolved Git dependencies or a
    /// poisoned registry. Retention must not guess that an uncertain entry is unused.
    pub fn cache_entries(&self, cache_root: &Path) -> Result<BTreeSet<String>, AppError> {
        let (revision, paths) = {
            let registry = self.0.lock().map_err(|_| poisoned())?;
            if registry.desired != registry.revision {
                return Err(AppError::Conflict(
                    "open project protection is still synchronizing; cache retention was skipped"
                        .into(),
                ));
            }
            (registry.revision, registry.paths.clone())
        };
        // Resolve shared metadata outside the registry lock; slow filesystem
        // work must never block the async command's short request marker.
        let entries = paths
            .iter()
            .try_fold(BTreeSet::new(), |mut entries, path| {
                if let Some(entry) = cache::cached_entry_name(cache_root, path)? {
                    entries.insert(entry);
                }
                Ok::<_, AppError>(entries)
            })?;
        let registry = self.0.lock().map_err(|_| poisoned())?;
        if registry.revision != revision || registry.desired != registry.revision {
            return Err(AppError::Conflict(
                "open project protection changed during cache lookup".into(),
            ));
        }
        Ok(entries)
    }
}

impl OpenRepos {
    /// The cache entries retention must not evict after cloning `new_entry`:
    /// the new clone itself and every clone an open tab uses.
    ///
    /// # Errors
    /// Returns an error if the registry was poisoned by an earlier failure.
    pub fn retention_keep_list(
        &self,
        cache_root: &Path,
        new_entry: String,
    ) -> Result<Vec<String>, AppError> {
        let mut keep = self.cache_entries(cache_root)?;
        keep.insert(new_entry);
        Ok(keep.into_iter().collect())
    }
}

/// Validates a request's bounds and resolves its paths to canonical roots.
///
/// A path that no longer resolves is dropped rather than rejected: a tab whose
/// folder vanished has nothing on disk left to protect, and it must not make
/// the report about the other tabs fail.
fn canonical_roots(paths: &[String]) -> Result<BTreeSet<PathBuf>, AppError> {
    if paths.len() > MAX_TABS {
        return Err(AppError::InvalidInput(format!(
            "at most {MAX_TABS} repositories can be open at once"
        )));
    }
    if paths.iter().any(|path| path.len() > MAX_PATH_BYTES) {
        return Err(AppError::InvalidInput(format!(
            "a repository path exceeds {MAX_PATH_BYTES} bytes"
        )));
    }
    paths.iter().try_fold(BTreeSet::new(), |mut roots, path| {
        match PathBuf::from(path).canonicalize() {
            Ok(root) => {
                roots.insert(root);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        Ok(roots)
    })
}

/// Reports which repositories the interface has open.
#[tauri::command]
#[specta::specta]
pub async fn sync_open_repositories(
    request: OpenRepositoriesRequest,
    open: tauri::State<'_, OpenRepos>,
) -> Result<(), AppError> {
    let open = open.inner().clone();
    open.requested(request.revision)?;
    read("sync_open_repositories", move || {
        let roots = canonical_roots(&request.paths)?;
        if !open.replace(request.revision, roots)? {
            tracing::debug!(
                revision = request.revision,
                "ignored a stale open repositories report"
            );
        }
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{canonical_roots, OpenRepos};
    use gitcanvas_core::{
        error::AppError,
        workspace::{MAX_PATH_BYTES, MAX_TABS},
    };

    fn roots(paths: &[&std::path::Path]) -> std::collections::BTreeSet<std::path::PathBuf> {
        let strings: Vec<String> = paths
            .iter()
            .map(|path| path.to_str().unwrap().to_owned())
            .collect();
        canonical_roots(&strings).unwrap()
    }

    #[test]
    fn a_newer_revision_replaces_the_whole_set() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let open = OpenRepos::default();

        assert!(open.replace(1, roots(&[a.path()])).unwrap());
        assert!(open.replace(2, roots(&[b.path()])).unwrap());

        let held = open.0.lock().unwrap();
        assert_eq!(held.paths, roots(&[b.path()]));
    }

    #[test]
    fn an_older_or_repeated_revision_never_rolls_the_set_back() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let open = OpenRepos::default();
        assert!(open.replace(5, roots(&[b.path()])).unwrap());

        assert!(!open.replace(4, roots(&[a.path()])).unwrap());
        assert!(!open.replace(5, roots(&[a.path()])).unwrap());

        let held = open.0.lock().unwrap();
        assert_eq!(held.paths, roots(&[b.path()]));
    }

    #[test]
    fn the_first_report_is_accepted_whatever_its_number() {
        let a = tempfile::tempdir().unwrap();
        let open = OpenRepos::default();

        assert!(open.replace(0, roots(&[a.path()])).unwrap());
    }

    #[test]
    fn an_empty_report_clears_the_set() {
        let a = tempfile::tempdir().unwrap();
        let open = OpenRepos::default();
        open.replace(1, roots(&[a.path()])).unwrap();

        open.replace(2, roots(&[])).unwrap();

        assert!(open.0.lock().unwrap().paths.is_empty());
    }

    #[test]
    fn missing_paths_are_dropped_and_aliases_collapse() {
        let directory = tempfile::tempdir().unwrap();
        let missing = directory.path().join("gone");
        let strings = vec![
            directory.path().to_str().unwrap().to_owned(),
            format!("{}/.", directory.path().to_str().unwrap()),
            missing.to_str().unwrap().to_owned(),
            String::new(),
        ];

        let resolved = canonical_roots(&strings).unwrap();

        assert_eq!(resolved.len(), 1);
    }

    #[test]
    fn too_many_repositories_are_refused() {
        let paths = vec!["/".to_owned(); MAX_TABS + 1];

        assert!(matches!(
            canonical_roots(&paths),
            Err(AppError::InvalidInput(_))
        ));
        assert!(canonical_roots(&paths[..MAX_TABS]).is_ok());
    }

    #[test]
    fn an_overlong_path_is_refused() {
        let paths = vec!["a".repeat(MAX_PATH_BYTES + 1)];

        assert!(matches!(
            canonical_roots(&paths),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn only_open_clones_inside_the_cache_are_reported() {
        let cache = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        git2::Repository::init(outside.path()).unwrap();
        let clone = cache.path().join("owner__repo");
        let nested = cache.path().join("owner__other").join("inner");
        fs::create_dir_all(&clone).unwrap();
        fs::create_dir_all(&nested).unwrap();
        let open = OpenRepos::default();
        open.replace(1, roots(&[&clone, &nested, outside.path()]))
            .unwrap();

        let entries = open.cache_entries(cache.path()).unwrap();

        // Nested projects keep their containing cache entry too.
        assert_eq!(
            entries.into_iter().collect::<Vec<_>>(),
            vec!["owner__other".to_owned(), "owner__repo".to_owned()]
        );
    }

    #[test]
    fn retention_spares_an_open_clone_even_when_it_is_the_oldest() {
        use gitcanvas_core::github::cache::{enforce_retention, status, MAX_REPOSITORIES};
        use std::time::{Duration, SystemTime};

        let cache = tempfile::tempdir().unwrap();
        let seed = |name: &str, age_seconds: u64| {
            let dir = cache.path().join(name);
            fs::create_dir_all(&dir).unwrap();
            let when = SystemTime::now()
                .checked_sub(Duration::from_secs(age_seconds))
                .unwrap();
            filetime::set_file_mtime(&dir, filetime::FileTime::from_system_time(when)).unwrap();
        };
        // The oldest clone is the one a tab still has open.
        seed("owner__open", 100_000);
        for index in 0..MAX_REPOSITORIES {
            seed(&format!("owner__other{index}"), 1_000 + index as u64);
        }
        let open = OpenRepos::default();
        open.replace(1, roots(&[&cache.path().join("owner__open")]))
            .unwrap();

        let keep = open
            .retention_keep_list(cache.path(), "owner__other0".to_owned())
            .unwrap();
        let evicted = enforce_retention(cache.path(), &keep).unwrap();

        assert_eq!(evicted.len(), 1);
        assert_ne!(evicted.first().map(String::as_str), Some("owner__open"));
        let names: Vec<_> = status(cache.path())
            .unwrap()
            .entries
            .into_iter()
            .map(|entry| entry.name)
            .collect();
        assert!(names.contains(&"owner__open".to_owned()));
    }

    #[test]
    fn the_keep_list_always_includes_the_new_clone_once() {
        let cache = tempfile::tempdir().unwrap();
        let clone = cache.path().join("owner__repo");
        fs::create_dir_all(&clone).unwrap();
        let open = OpenRepos::default();
        open.replace(1, roots(&[&clone])).unwrap();

        let keep = open
            .retention_keep_list(cache.path(), "owner__repo".to_owned())
            .unwrap();

        assert_eq!(keep, vec!["owner__repo".to_owned()]);
    }

    #[test]
    fn a_missing_cache_root_reports_nothing() {
        let a = tempfile::tempdir().unwrap();
        let open = OpenRepos::default();
        open.replace(1, roots(&[a.path()])).unwrap();

        let entries = open.cache_entries(&a.path().join("never-created")).unwrap();

        assert!(entries.is_empty());
    }
    #[test]
    fn retention_waits_for_the_newest_received_report() {
        let cache = tempfile::tempdir().unwrap();
        let root = cache.path().join("owner__repo");
        fs::create_dir_all(&root).unwrap();
        let open = OpenRepos::default();
        open.replace(1, roots(&[&root])).unwrap();
        open.requested(3).unwrap();
        open.replace(2, roots(&[])).unwrap();
        assert!(matches!(
            open.cache_entries(cache.path()),
            Err(AppError::Conflict(_))
        ));
        open.replace(3, roots(&[&root])).unwrap();
        assert!(open
            .cache_entries(cache.path())
            .unwrap()
            .contains("owner__repo"));
        open.requested(2).unwrap();
        assert!(open.cache_entries(cache.path()).is_ok());
    }
}
