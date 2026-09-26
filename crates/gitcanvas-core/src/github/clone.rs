//! Cloning GitHub repositories into an application-owned cache.
//!
//! Clones are always complete. A `--depth` clone truncates history, and the
//! shape of history is the entire point of this application: a truncated graph
//! would be visually convincing and wrong, which is worse than refusing.

use std::path::Path;

use git2::{build::RepoBuilder, FetchOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, github::credentials};

/// How far along a clone is.
///
/// `received_objects` and `total_objects` come straight from libgit2's transfer
/// progress; `total_objects` is zero until the server has finished counting.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
pub struct CloneProgress {
    pub received_objects: u32,
    pub total_objects: u32,
    pub indexed_objects: u32,
    pub received_bytes: u64,
}

/// Where a clone landed.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ClonedRepository {
    pub path: String,
    pub full_name: String,
}

/// The two halves of a GitHub `owner/name`, validated and case-folded.
///
/// GitHub owners are alphanumerics and hyphens; repository names add `.` and
/// `_`. Because an owner can never contain `_`, joining the halves with `__`
/// gives every repository exactly one cache entry and no two repositories the
/// same one, which a lossy character replacement cannot promise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositoryName {
    owner: String,
    name: String,
}

impl RepositoryName {
    /// Parses and validates `owner/name`.
    ///
    /// # Errors
    ///
    /// Returns [`AppError::InvalidInput`] for anything that is not a plain
    /// GitHub repository name, including path traversal attempts.
    pub fn parse(full_name: &str) -> Result<Self, AppError> {
        let invalid = || AppError::InvalidInput(format!("{full_name:?} is not an owner/name pair"));
        let (owner, name) = full_name.split_once('/').ok_or_else(invalid)?;
        let owner_ok = !owner.is_empty()
            && owner.len() <= 39
            && owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
        let name_ok = !name.is_empty()
            && name.len() <= 100
            && name != "."
            && name != ".."
            && name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
        if !owner_ok || !name_ok {
            return Err(invalid());
        }
        Ok(Self {
            owner: owner.to_ascii_lowercase(),
            name: name.to_ascii_lowercase(),
        })
    }

    /// The single flat directory name this repository uses in the cache.
    #[must_use]
    pub fn cache_entry(&self) -> String {
        format!("{}__{}", self.owner, self.name)
    }

    /// The only URL a clone of this repository may use.
    #[must_use]
    pub fn https_url(&self) -> String {
        format!("https://github.com/{}/{}.git", self.owner, self.name)
    }
}

/// Derives the cache directory entry for a repository.
///
/// # Errors
///
/// Returns [`AppError::InvalidInput`] when `full_name` is not a valid
/// `owner/name`.
pub fn cache_entry_name(full_name: &str) -> Result<String, AppError> {
    RepositoryName::parse(full_name).map(|name| name.cache_entry())
}

/// Clones a repository into `cache_root`, reporting progress as it goes.
///
/// `clone_url` must be the repository's own `https://github.com` URL: the
/// stored token is sent to whatever host is cloned from, so accepting an
/// arbitrary URL from the interface would hand the token to it.
///
/// A private repository authenticates with the stored token; a public one needs
/// no credentials, so a missing token is not an error until the server asks.
///
/// # Errors
///
/// Returns [`AppError`] when the name or URL is not a GitHub repository, the
/// destination cannot be prepared, credentials are rejected, or libgit2 fails
/// the transfer.
pub fn clone_repository(
    clone_url: &str,
    full_name: &str,
    cache_root: &Path,
    on_progress: impl FnMut(CloneProgress),
) -> Result<ClonedRepository, AppError> {
    let name = RepositoryName::parse(full_name)?;
    if !same_remote(clone_url, &name.https_url()) {
        return Err(AppError::InvalidInput(format!(
            "{clone_url:?} is not the GitHub URL of {full_name}"
        )));
    }
    clone_into_cache(&name.https_url(), &name, cache_root, on_progress)
}

/// Whether two remote URLs name the same repository, ignoring case, a trailing
/// `.git` and a trailing slash.
fn same_remote(left: &str, right: &str) -> bool {
    fn normalize(url: &str) -> String {
        let url = url.trim().trim_end_matches('/').to_ascii_lowercase();
        url.strip_suffix(".git").map_or(url.clone(), str::to_owned)
    }
    normalize(left) == normalize(right)
}

/// Whether the repository at `path` opens and its `origin` is `url`.
fn origin_matches(path: &Path, url: &str) -> bool {
    let Ok(repo) = Repository::open(path) else {
        return false;
    };
    let Ok(remote) = repo.find_remote("origin") else {
        return false;
    };
    remote.url().is_ok_and(|origin| same_remote(origin, url))
}

/// The transfer itself, with the URL already trusted by the caller.
///
/// Split from [`clone_repository`] so the cache behaviour — reuse, replacing a
/// stale entry, never leaving a half-written clone — can be tested against a
/// local repository, which the GitHub-only public entry point refuses.
fn clone_into_cache(
    url: &str,
    name: &RepositoryName,
    cache_root: &Path,
    mut on_progress: impl FnMut(CloneProgress),
) -> Result<ClonedRepository, AppError> {
    let entry = name.cache_entry();
    let destination = cache_root.join(&entry);
    let cloned = || ClonedRepository {
        path: destination.to_string_lossy().into_owned(),
        full_name: format!("{}/{}", name.owner, name.name),
    };

    if destination.exists() {
        // An existing clone is reused rather than re-fetched; the caller decides
        // when to refresh it. It must really be this repository, though: an
        // entry whose origin is somewhere else was not put there by a clone of
        // `url`, and serving it would show the wrong history.
        if origin_matches(&destination, url) {
            return Ok(cloned());
        }
        // The cache is application-owned, so an unusable or foreign entry is
        // safe to replace.
        std::fs::remove_dir_all(&destination)?;
    }

    std::fs::create_dir_all(cache_root)?;

    // Cloned beside the final location and renamed into place, so a crash or a
    // failed transfer can never leave a half-written repository that a later
    // run would take for a good one. The leading dot keeps it out of the
    // cache's listing and retention accounting.
    let partial = cache_root.join(format!(".partial-{entry}"));
    if partial.exists() {
        std::fs::remove_dir_all(&partial)?;
    }

    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(credentials::callback());
    callbacks.transfer_progress(move |stats| {
        on_progress(CloneProgress {
            received_objects: u32::try_from(stats.received_objects()).unwrap_or(u32::MAX),
            total_objects: u32::try_from(stats.total_objects()).unwrap_or(u32::MAX),
            indexed_objects: u32::try_from(stats.indexed_objects()).unwrap_or(u32::MAX),
            received_bytes: stats.received_bytes() as u64,
        });
        true
    });

    let mut fetch = FetchOptions::new();
    fetch.remote_callbacks(callbacks);
    // Deliberately no `.depth()`: see the module comment.

    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch);

    match builder.clone(url, &partial) {
        Ok(repo) => {
            drop(repo);
            std::fs::rename(&partial, &destination)?;
            Ok(cloned())
        }
        Err(error) => {
            let _ = std::fs::remove_dir_all(&partial);
            Err(
                if error.class() == git2::ErrorClass::Http || error.code() == git2::ErrorCode::Auth
                {
                    AppError::InvalidInput(
                        "GitHub refused the credentials for this repository".to_owned(),
                    )
                } else {
                    AppError::from(error)
                },
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source_repository(dir: &Path) -> String {
        let repo = Repository::init(dir).unwrap();
        let signature = git2::Signature::now("Test", "test@example.com").unwrap();
        let tree = repo
            .find_tree(repo.treebuilder(None).unwrap().write().unwrap())
            .unwrap();
        repo.commit(Some("HEAD"), &signature, &signature, "root", &tree, &[])
            .unwrap();
        dir.to_str().unwrap().to_owned()
    }

    #[test]
    fn names_that_differ_only_by_separator_never_share_an_entry() {
        let left = cache_entry_name("a-b/c").unwrap();
        let right = cache_entry_name("a/b-c").unwrap();
        assert_ne!(left, right);
        // Owners cannot contain `_`, so the first `__` is always the separator.
        assert!(cache_entry_name("a_b/c").is_err());
        assert_ne!(
            cache_entry_name("a/b_c").unwrap(),
            cache_entry_name("a/b-c").unwrap()
        );
        assert_eq!(cache_entry_name("Owner/Repo").unwrap(), "owner__repo");
        assert_eq!(
            cache_entry_name("owner/repo").unwrap(),
            cache_entry_name("OWNER/REPO").unwrap()
        );
    }

    #[test]
    fn hostile_names_are_refused_instead_of_sanitised() {
        for name in [
            "",
            "owner",
            "/repo",
            "owner/",
            "../../etc/passwd",
            "a/../../b",
            "owner/..",
            "owner/.",
            "own_er/repo",
            "owner/re po",
            "owner/repo/extra",
            "owner\\repo",
        ] {
            assert!(cache_entry_name(name).is_err(), "accepted {name:?}");
        }
    }

    #[test]
    fn a_clone_url_must_belong_to_the_repository_it_claims() {
        let root = tempfile::tempdir().unwrap();
        for url in [
            "https://evil.example/owner/repo.git",
            "https://github.com/other/repo.git",
            "http://github.com/owner/repo.git",
            "file:///tmp/anything",
        ] {
            let error = clone_repository(url, "owner/repo", root.path(), |_| {}).unwrap_err();
            assert!(matches!(error, AppError::InvalidInput(_)), "{url}");
        }
        assert!(same_remote(
            "https://github.com/Owner/Repo",
            "https://github.com/owner/repo.git/"
        ));
    }

    #[test]
    fn a_clone_lands_in_its_entry_and_is_reused() {
        let source = tempfile::tempdir().unwrap();
        let url = source_repository(source.path());
        let root = tempfile::tempdir().unwrap();
        let name = RepositoryName::parse("owner/repo").unwrap();

        let first = clone_into_cache(&url, &name, root.path(), |_| {}).unwrap();
        assert!(Path::new(&first.path).ends_with("owner__repo"));
        assert!(Repository::open(&first.path).is_ok());
        assert!(!root.path().join(".partial-owner__repo").exists());

        // A marker proves the second call reuses the directory rather than
        // recloning over it.
        std::fs::write(Path::new(&first.path).join("marker"), b"kept").unwrap();
        let second = clone_into_cache(&url, &name, root.path(), |_| {}).unwrap();
        assert_eq!(first.path, second.path);
        assert!(Path::new(&second.path).join("marker").exists());
    }

    #[test]
    fn an_entry_cloned_from_elsewhere_is_replaced_not_served() {
        let wanted = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let wanted_url = source_repository(wanted.path());
        let other_url = source_repository(other.path());
        let root = tempfile::tempdir().unwrap();
        let name = RepositoryName::parse("owner/repo").unwrap();

        clone_into_cache(&other_url, &name, root.path(), |_| {}).unwrap();
        let replaced = clone_into_cache(&wanted_url, &name, root.path(), |_| {}).unwrap();

        let origin = Repository::open(&replaced.path)
            .unwrap()
            .find_remote("origin")
            .unwrap()
            .url()
            .unwrap()
            .to_owned();
        assert!(same_remote(&origin, &wanted_url));
    }

    #[test]
    fn a_failed_clone_leaves_nothing_behind() {
        let root = tempfile::tempdir().unwrap();
        let name = RepositoryName::parse("owner/repo").unwrap();
        let missing = root.path().join("does-not-exist");

        let result = clone_into_cache(missing.to_str().unwrap(), &name, root.path(), |_| {});

        assert!(result.is_err());
        assert!(!root.path().join("owner__repo").exists());
        assert!(!root.path().join(".partial-owner__repo").exists());
    }

    #[test]
    fn an_interrupted_clone_is_cleared_before_the_next_attempt() {
        let source = tempfile::tempdir().unwrap();
        let url = source_repository(source.path());
        let root = tempfile::tempdir().unwrap();
        let name = RepositoryName::parse("owner/repo").unwrap();
        let leftover = root.path().join(".partial-owner__repo");
        std::fs::create_dir_all(&leftover).unwrap();
        std::fs::write(leftover.join("junk"), b"x").unwrap();

        let cloned = clone_into_cache(&url, &name, root.path(), |_| {}).unwrap();

        assert!(Repository::open(&cloned.path).is_ok());
        assert!(!leftover.exists());
    }
}
