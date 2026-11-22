//! Identifies the GitHub repository that supplies release metadata.

use git2::Repository;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    error::AppError,
    github::{clone::RepositoryName, credentials::is_github_https},
};

/// The provider and repository that supply release metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseSource {
    /// A repository hosted by GitHub.
    Github {
        /// Repository owner, normalized to lowercase.
        owner: String,
        /// Repository name, normalized to lowercase.
        name: String,
    },
}

/// Selects and validates the GitHub release source configured for `repository`.
///
/// If the current branch has a GitHub upstream remote, it wins. Otherwise,
/// `origin` is used when it is a GitHub remote. Only HTTPS GitHub remotes are
/// supported; SSH and other providers are rejected explicitly.
///
/// # Errors
///
/// Returns [`AppError::UnsupportedSource`] if no eligible GitHub HTTPS remote
/// exists, or [`AppError::Git`] if repository configuration cannot be read.
pub fn select_source(repository: &Repository) -> Result<ReleaseSource, AppError> {
    let config = repository.config()?;
    let mut candidates = Vec::new();
    for name in repository
        .remotes()?
        .iter()
        .filter_map(|name| name.ok().flatten())
    {
        let remote = repository.find_remote(name)?;
        let Ok(url) = remote.url() else {
            continue;
        };
        let url = effective_url(&config, url);
        if let Some(source) = source_from_url(&url) {
            candidates.push((name.to_owned(), source));
        }
    }

    let upstream = repository
        .head()
        .ok()
        .and_then(|head| head.name().ok().map(str::to_owned))
        .filter(|name| name.starts_with("refs/heads/"))
        .and_then(|branch| repository.branch_upstream_remote(&branch).ok())
        .and_then(|name| name.as_str().ok().map(str::to_owned));

    let selected = upstream
        .as_deref()
        .and_then(|upstream_name| {
            candidates
                .iter()
                .find(|(name, _)| name == upstream_name)
                .map(|(_, source)| source.clone())
        })
        .or_else(|| {
            candidates
                .iter()
                .find(|(name, _)| name == "origin")
                .map(|(_, source)| source.clone())
        });

    selected.ok_or(AppError::UnsupportedSource)
}

fn source_from_url(url: &str) -> Option<ReleaseSource> {
    if !is_github_https(url) {
        return None;
    }
    let path = url.strip_prefix("https://")?.split_once('/')?.1;
    if path.contains(['?', '#']) {
        return None;
    }
    let mut segments = path.split('/');
    let owner = segments.next()?;
    let repository = segments.next()?;
    if segments.next().is_some() || owner.is_empty() || repository.is_empty() {
        return None;
    }
    let name = repository.strip_suffix(".git").unwrap_or(repository);
    RepositoryName::parse(&format!("{owner}/{name}")).ok()?;
    Some(ReleaseSource::Github {
        owner: owner.to_ascii_lowercase(),
        name: name.to_ascii_lowercase(),
    })
}

/// Applies the longest matching `url.*.insteadOf` prefix, as Git does.
fn effective_url(config: &git2::Config, url: &str) -> String {
    let Ok(entries) = config.entries(None) else {
        return url.to_owned();
    };
    let mut rewrite: Option<(usize, String, String)> = None;
    let mut entries = entries;
    while let Some(Ok(entry)) = entries.next() {
        let Ok(key) = entry.name() else {
            continue;
        };
        let Some(base) = key
            .strip_prefix("url.")
            .and_then(|key| key.strip_suffix(".insteadof"))
        else {
            continue;
        };
        let Ok(prefix) = entry.value() else {
            continue;
        };
        if url.starts_with(prefix)
            && rewrite
                .as_ref()
                .is_none_or(|(length, _, _)| prefix.len() > *length)
        {
            rewrite = Some((prefix.len(), base.to_owned(), prefix.to_owned()));
        }
    }
    rewrite.map_or_else(
        || url.to_owned(),
        |(_, base, prefix)| format!("{base}{}", url.get(prefix.len()..).unwrap_or_default()),
    )
}

#[cfg(test)]
mod tests {
    use git2::{Repository, RepositoryInitOptions};
    use tempfile::TempDir;

    use super::{select_source, ReleaseSource};

    fn repository() -> (TempDir, Repository) {
        let dir = TempDir::new().unwrap();
        let repository = Repository::init_opts(
            dir.path(),
            RepositoryInitOptions::new().initial_head("main"),
        )
        .unwrap();
        (dir, repository)
    }

    fn create_head_commit(repository: &Repository) {
        let tree_id = repository.treebuilder(None).unwrap().write().unwrap();
        let tree = repository.find_tree(tree_id).unwrap();
        let signature = git2::Signature::now("test", "test@example.com").unwrap();
        repository
            .commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .unwrap();
    }

    #[test]
    fn selects_origin_when_no_branch_upstream_is_configured() {
        let (_dir, repository) = repository();
        repository
            .remote("origin", "https://github.com/Owner/Project.git")
            .unwrap();
        repository
            .remote("mirror", "https://github.com/other/mirror")
            .unwrap();

        assert_eq!(
            select_source(&repository).unwrap(),
            ReleaseSource::Github {
                owner: "owner".into(),
                name: "project".into(),
            }
        );
    }

    #[test]
    fn selects_the_github_upstream_over_origin() {
        let (_dir, repository) = repository();
        repository
            .remote("origin", "https://github.com/origin/repository.git")
            .unwrap();
        repository
            .remote("upstream", "https://github.com/upstream/repository.git")
            .unwrap();
        create_head_commit(&repository);
        let mut config = repository.config().unwrap();
        config.set_str("branch.main.remote", "upstream").unwrap();
        config
            .set_str("branch.main.merge", "refs/heads/main")
            .unwrap();

        assert_eq!(
            select_source(&repository).unwrap(),
            ReleaseSource::Github {
                owner: "upstream".into(),
                name: "repository".into(),
            }
        );
    }

    #[test]
    fn rejects_ssh_non_github_and_invalid_repository_names() {
        let (_dir, repository) = repository();
        repository
            .remote("origin", "ssh://git@github.com/owner/repo.git")
            .unwrap();
        assert_eq!(
            select_source(&repository),
            Err(crate::error::AppError::UnsupportedSource)
        );
        assert_eq!(
            super::source_from_url("git@github.com:owner/repo.git"),
            None
        );

        repository
            .remote_set_url("origin", "https://gitlab.com/owner/repo.git")
            .unwrap();
        assert_eq!(
            select_source(&repository),
            Err(crate::error::AppError::UnsupportedSource)
        );

        assert_eq!(
            super::source_from_url("https://github.com/owner/../repo.git"),
            None
        );
    }

    #[test]
    fn validates_the_effective_instead_of_url() {
        let (_dir, repository) = repository();
        repository.remote("origin", "gh:Owner/Project").unwrap();
        let mut config = repository.config().unwrap();
        config
            .set_str("url.https://github.com/.insteadOf", "gh:")
            .unwrap();

        assert_eq!(
            select_source(&repository).unwrap(),
            ReleaseSource::Github {
                owner: "owner".into(),
                name: "project".into(),
            }
        );
    }

    #[test]
    fn serializes_the_provider_with_its_repository_identity() {
        let source = ReleaseSource::Github {
            owner: "owner".into(),
            name: "project".into(),
        };

        assert_eq!(
            serde_json::to_value(source).unwrap(),
            serde_json::json!({ "github": { "owner": "owner", "name": "project" } })
        );
    }
}
