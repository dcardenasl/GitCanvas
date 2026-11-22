//! Explicitly fetches one tag without moving an existing local tag.

use std::sync::atomic::{AtomicU64, Ordering};

use git2::{AutotagOption, Direction, FetchOptions, Oid, Reference, Repository, Tag};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    error::AppError, github::credentials, releases::select_source_remote, repository::ActiveRepo,
};

/// The result of explicitly fetching one tag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind")]
pub enum FetchTagOutcome {
    /// The remote tag was fetched and installed locally.
    Fetched,
    /// The remote and local tag already point at the same Git object.
    AlreadyPresent,
    /// The tag exists both locally and remotely but points at different objects.
    Conflict {
        /// Object id currently named by the local tag.
        local_target: String,
        /// Object id advertised by the remote tag.
        remote_target: String,
    },
    /// The selected remote does not advertise this tag.
    NotFoundOnRemote,
}

/// Fetches a single GitHub tag, preserving every existing local tag.
///
/// The caller must hold the repository write permit and common-directory lock
/// before invoking this operation. The Tauri command layer owns that ordering.
///
/// # Errors
///
/// Returns [`AppError::InvalidInput`] for an invalid tag name,
/// [`AppError::UnsupportedSource`] if the repository has no supported GitHub
/// HTTPS source, or a typed Git/authentication/network error when the remote
/// operation fails.
pub fn fetch_tag(active: &ActiveRepo, tag_name: &str) -> Result<FetchTagOutcome, AppError> {
    let reference_name = tag_reference_name(tag_name)?;
    let repository = active.open()?;
    let local_target = local_tag_target(&repository, &reference_name)?;
    let (_, remote_name) = select_source_remote(&repository)?;
    let mut remote = repository.find_remote(&remote_name)?;
    fetch_tag_from_remote(&repository, &mut remote, &reference_name, local_target)
}

fn tag_reference_name(tag_name: &str) -> Result<String, AppError> {
    let reference_name = format!("refs/tags/{tag_name}");
    if tag_name.starts_with("refs/")
        || !Tag::is_valid_name(tag_name)
        || !Reference::is_valid_name(&reference_name)
    {
        return Err(AppError::InvalidInput(format!(
            "{tag_name:?} is not a valid tag name"
        )));
    }
    Ok(reference_name)
}

fn local_tag_target(
    repository: &Repository,
    reference_name: &str,
) -> Result<Option<Oid>, AppError> {
    match repository.find_reference(reference_name) {
        Ok(reference) => {
            let resolved = reference.resolve()?;
            resolved.target().map(Some).ok_or_else(|| {
                AppError::Git(format!(
                    "tag reference {reference_name:?} has no object target"
                ))
            })
        }
        Err(error) if error.code() == git2::ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn fetch_tag_from_remote(
    repository: &Repository,
    remote: &mut git2::Remote<'_>,
    reference_name: &str,
    local_target: Option<Oid>,
) -> Result<FetchTagOutcome, AppError> {
    let remote_target = {
        let mut callbacks = git2::RemoteCallbacks::new();
        callbacks.credentials(credentials::callback());
        let connection = remote
            .connect_auth(Direction::Fetch, Some(callbacks), None)
            .map_err(AppError::from_git2_remote)?;
        let target = connection
            .list()
            .map_err(AppError::from_git2_remote)?
            .iter()
            .find(|head| head.name() == reference_name)
            .map(git2::RemoteHead::oid);
        drop(connection);
        target
    };

    let Some(remote_target) = remote_target else {
        return Ok(FetchTagOutcome::NotFoundOnRemote);
    };
    if let Some(local_target) = local_target {
        if local_target == remote_target {
            return Ok(FetchTagOutcome::AlreadyPresent);
        }
        return Ok(FetchTagOutcome::Conflict {
            local_target: local_target.to_string(),
            remote_target: remote_target.to_string(),
        });
    }

    let temporary_name = temporary_reference_name(repository)?;
    let mut temporary = TemporaryReference::new(repository, temporary_name.clone());
    let refspec = format!("{reference_name}:{temporary_name}");
    let mut options = FetchOptions::new();
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(credentials::callback());
    options.remote_callbacks(callbacks);
    options.download_tags(AutotagOption::None);
    remote
        .fetch(&[refspec.as_str()], Some(&mut options), None)
        .map_err(AppError::from_git2_remote)?;

    let target = repository
        .find_reference(&temporary_name)?
        .target()
        .ok_or_else(|| {
            AppError::Git("the temporary fetched tag has no object target".to_owned())
        })?;
    if target != remote_target {
        return Err(AppError::Conflict(
            "the remote tag changed while it was being fetched".to_owned(),
        ));
    }
    repository.reference(reference_name, target, false, "gitcanvas: fetch one tag")?;
    temporary.remove()?;
    Ok(FetchTagOutcome::Fetched)
}

fn temporary_reference_name(repository: &Repository) -> Result<String, AppError> {
    static NEXT_REFERENCE: AtomicU64 = AtomicU64::new(0);
    for _ in 0..128 {
        let sequence = NEXT_REFERENCE.fetch_add(1, Ordering::Relaxed);
        let name = format!("refs/gitcanvas/fetch-tag-{}-{sequence}", std::process::id());
        match repository.find_reference(&name) {
            Err(error) if error.code() == git2::ErrorCode::NotFound => return Ok(name),
            Ok(_) => {}
            Err(error) => return Err(error.into()),
        }
    }
    Err(AppError::ResourceLimitExceeded(
        "could not reserve a temporary tag reference".to_owned(),
    ))
}

struct TemporaryReference<'repo> {
    repository: &'repo Repository,
    name: String,
    active: bool,
}

impl<'repo> TemporaryReference<'repo> {
    fn new(repository: &'repo Repository, name: String) -> Self {
        Self {
            repository,
            name,
            active: true,
        }
    }

    fn remove(&mut self) -> Result<(), AppError> {
        match self.repository.find_reference(&self.name) {
            Ok(mut reference) => reference.delete()?,
            Err(error) if error.code() == git2::ErrorCode::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        self.active = false;
        Ok(())
    }
}

impl Drop for TemporaryReference<'_> {
    fn drop(&mut self) {
        if self.active {
            if let Ok(mut reference) = self.repository.find_reference(&self.name) {
                let _ = reference.delete();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use git2::{AutotagOption, FetchOptions, Oid, Repository, Signature, Time};
    use tempfile::TempDir;

    use super::{fetch_tag_from_remote, tag_reference_name, FetchTagOutcome};

    struct RemotePair {
        _source_dir: TempDir,
        source: Repository,
        local_dir: TempDir,
        local: Repository,
        _bare_dir: TempDir,
        target: Oid,
    }

    fn commit(repository: &Repository, parent: Option<Oid>, message: &str, timestamp: i64) -> Oid {
        let mut builder = match parent {
            Some(parent) => {
                let commit = repository.find_commit(parent).unwrap();
                repository
                    .treebuilder(Some(&commit.tree().unwrap()))
                    .unwrap()
            }
            None => repository.treebuilder(None).unwrap(),
        };
        let blob = repository.blob(message.as_bytes()).unwrap();
        builder.insert("version.txt", blob, 0o100_644).unwrap();
        let tree = repository.find_tree(builder.write().unwrap()).unwrap();
        let signature =
            Signature::new("Release test", "test@example.com", &Time::new(timestamp, 0)).unwrap();
        let parents: Vec<_> = parent
            .into_iter()
            .map(|parent| repository.find_commit(parent).unwrap())
            .collect();
        let parent_refs: Vec<_> = parents.iter().collect();
        repository
            .commit(
                Some("refs/heads/main"),
                &signature,
                &signature,
                message,
                &tree,
                &parent_refs,
            )
            .unwrap()
    }

    fn remote_pair() -> RemotePair {
        let source_dir = tempfile::tempdir().unwrap();
        let source = Repository::init(source_dir.path()).unwrap();
        let base = commit(&source, None, "base", 1_000);
        source.set_head("refs/heads/main").unwrap();

        let bare_dir = tempfile::tempdir().unwrap();
        let _bare = Repository::init_bare(bare_dir.path()).unwrap();
        Repository::open_bare(bare_dir.path())
            .unwrap()
            .set_head("refs/heads/main")
            .unwrap();
        let bare_url = bare_dir.path().to_str().unwrap();
        source.remote("origin", bare_url).unwrap();
        source
            .find_remote("origin")
            .unwrap()
            .push(&["refs/heads/main:refs/heads/main"], None)
            .unwrap();

        let local_dir = tempfile::tempdir().unwrap();
        let local = Repository::clone(bare_url, local_dir.path()).unwrap();
        let target = commit(&source, Some(base), "release", 2_000);
        source
            .tag_lightweight(
                "v1.0",
                source.find_commit(target).unwrap().as_object(),
                false,
            )
            .unwrap();
        source
            .find_remote("origin")
            .unwrap()
            .push(&["refs/tags/v1.0:refs/tags/v1.0"], None)
            .unwrap();

        RemotePair {
            _source_dir: source_dir,
            source,
            local_dir,
            local,
            _bare_dir: bare_dir,
            target,
        }
    }

    fn fetch(pair: &RemotePair, name: &str) -> Result<FetchTagOutcome, crate::error::AppError> {
        let mut remote = pair.local.find_remote("origin")?;
        let reference_name = tag_reference_name(name)?;
        let local_target = super::local_tag_target(&pair.local, &reference_name)?;
        fetch_tag_from_remote(&pair.local, &mut remote, &reference_name, local_target)
    }

    fn temporary_refs(repository_path: &Path) -> Vec<String> {
        Repository::open(repository_path)
            .unwrap()
            .references_glob("refs/gitcanvas/fetch-tag-*")
            .unwrap()
            .filter_map(Result::ok)
            .filter_map(|reference| reference.name().ok().map(str::to_owned))
            .collect()
    }

    #[test]
    fn fetches_an_absent_tag_through_a_temporary_reference_then_cleans_it() {
        let pair = remote_pair();

        assert_eq!(fetch(&pair, "v1.0").unwrap(), FetchTagOutcome::Fetched);
        assert_eq!(
            pair.local.refname_to_id("refs/tags/v1.0").unwrap(),
            pair.target
        );
        assert!(temporary_refs(pair.local_dir.path()).is_empty());
    }

    #[test]
    fn an_equal_existing_tag_is_already_present_without_rewriting_it() {
        let pair = remote_pair();
        let mut options = FetchOptions::new();
        options.download_tags(AutotagOption::None);
        pair.local
            .find_remote("origin")
            .unwrap()
            .fetch(
                &["refs/tags/v1.0:refs/heads/fetched-release"],
                Some(&mut options),
                None,
            )
            .unwrap();
        pair.local
            .reference("refs/tags/v1.0", pair.target, false, "test tag")
            .unwrap();

        assert_eq!(
            fetch(&pair, "v1.0").unwrap(),
            FetchTagOutcome::AlreadyPresent
        );
        assert_eq!(
            pair.local.refname_to_id("refs/tags/v1.0").unwrap(),
            pair.target
        );
        assert!(temporary_refs(pair.local_dir.path()).is_empty());
    }

    #[test]
    fn a_different_existing_tag_conflicts_without_moving_the_local_tag() {
        let pair = remote_pair();
        let local_target = pair.local.head().unwrap().target().unwrap();
        pair.local
            .reference("refs/tags/v1.0", local_target, false, "test tag")
            .unwrap();

        assert_eq!(
            fetch(&pair, "v1.0").unwrap(),
            FetchTagOutcome::Conflict {
                local_target: local_target.to_string(),
                remote_target: pair.target.to_string(),
            }
        );
        assert_eq!(
            pair.local.refname_to_id("refs/tags/v1.0").unwrap(),
            local_target
        );
        assert!(temporary_refs(pair.local_dir.path()).is_empty());
    }

    #[test]
    fn a_remote_tag_missing_from_the_local_repository_is_not_found_without_writes() {
        let pair = remote_pair();
        let empty_dir = tempfile::tempdir().unwrap();
        let empty = Repository::init_bare(empty_dir.path()).unwrap();
        pair.local
            .remote_set_url("origin", empty_dir.path().to_str().unwrap())
            .unwrap();

        assert_eq!(
            fetch(&pair, "v1.0").unwrap(),
            FetchTagOutcome::NotFoundOnRemote
        );
        assert!(pair.local.find_reference("refs/tags/v1.0").is_err());
        assert!(temporary_refs(pair.local_dir.path()).is_empty());
        drop(empty);
    }

    #[test]
    fn invalid_tag_names_are_refused_before_remote_access() {
        let pair = remote_pair();
        for invalid in ["../secret", "refs/heads/main", "-x", "a:b", "a b"] {
            assert!(matches!(
                tag_reference_name(invalid),
                Err(crate::error::AppError::InvalidInput(_))
            ));
        }
        assert!(pair.source.find_reference("refs/tags/v1.0").is_ok());
    }
}
