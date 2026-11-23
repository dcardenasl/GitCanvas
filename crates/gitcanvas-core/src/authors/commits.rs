//! Bounded, resumable commit ID pages for one resolved author identity.

use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use git2::Oid;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use crate::{
    authors::{load_mailmap, AuthorKey},
    error::AppError,
    history::{
        resolve_history_scope, scope_id, with_walk_count, HistoryReader, MAX_CACHED_COMMITS,
    },
    repository::ActiveRepo,
};

const AUTHOR_COMMIT_PAGE_SIZE: usize = 500;
const MAX_CURSOR_BYTES: usize = 256;
const MAX_CACHED_AUTHOR_LISTS: usize = 16;

/// Request for one page of an author's matching commit IDs.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AuthorCommitIdsRequest {
    /// Resolved identity selected by the caller.
    pub author: AuthorKey,
    /// Opaque continuation returned by the previous page.
    pub cursor: Option<String>,
}

/// A bounded page of commit IDs, in the repository's topological history order.
#[derive(Debug, Clone, Serialize, Type)]
pub struct AuthorCommitIdsPage {
    /// Commit object IDs in this page.
    pub commit_ids: Vec<String>,
    /// Continuation for the next page; null at the end.
    pub next_cursor: Option<String>,
}

#[derive(Default)]
pub(crate) struct AuthorCommitCache(Mutex<VecDeque<CachedAuthorCommits>>);

struct CachedAuthorCommits {
    repository: PathBuf,
    key: String,
    ids: Arc<[Oid]>,
}

impl AuthorCommitCache {
    fn get(&self, repository: &Path, key: &str) -> Result<Option<Arc<[Oid]>>, AppError> {
        let mut entries = self.0.lock().map_err(|_| unavailable_cache())?;
        let Some(index) = entries
            .iter()
            .position(|entry| entry.repository == *repository && entry.key == key)
        else {
            return Ok(None);
        };
        let Some(entry) = entries.remove(index) else {
            return Ok(None);
        };
        let ids = Arc::clone(&entry.ids);
        entries.push_back(entry);
        Ok(Some(ids))
    }

    fn insert(
        &self,
        repository: PathBuf,
        key: String,
        ids: Vec<Oid>,
        budget: usize,
    ) -> Result<Arc<[Oid]>, AppError> {
        let mut entries = self.0.lock().map_err(|_| unavailable_cache())?;
        entries.retain(|entry| entry.repository != repository || entry.key != key);
        while entries.len() >= MAX_CACHED_AUTHOR_LISTS
            || entries
                .iter()
                .map(|entry| entry.ids.len())
                .fold(0usize, usize::saturating_add)
                .saturating_add(ids.len())
                > budget
        {
            if entries.pop_front().is_none() {
                break;
            }
        }
        let ids: Arc<[Oid]> = ids.into();
        entries.push_back(CachedAuthorCommits {
            repository,
            key,
            ids: Arc::clone(&ids),
        });
        Ok(ids)
    }
}

/// Returns a page of IDs attributed to `author` over the repository's current frozen roots.
///
/// # Errors
/// Returns `StaleCursor` when roots, `.mailmap`, or the selected author differ from the cursor.
/// Returns `ResourceLimitExceeded` if the history exceeds the reader’s ID budget.
pub fn get_author_commit_ids(
    active: &ActiveRepo,
    request: &AuthorCommitIdsRequest,
    reader: &HistoryReader,
) -> Result<AuthorCommitIdsPage, AppError> {
    let repo = active.open()?;
    let (roots, references) = resolve_history_scope(&repo, None)?;
    let mailmap = load_mailmap(&repo);
    let base_scope = format!(
        "{}:{}",
        scope_id(&references, &roots)?,
        mailmap.content_hash()
    );
    let mut digest = Sha256::new();
    digest.update((request.author.name.len() as u64).to_le_bytes());
    digest.update(request.author.name.as_bytes());
    digest.update((request.author.email.len() as u64).to_le_bytes());
    digest.update(request.author.email.as_bytes());
    let author_scope = format!("{:x}", digest.finalize());
    let scope = format!("{base_scope}:{author_scope}");
    let budget = reader.budget().min(MAX_CACHED_COMMITS);
    let start = match request.cursor.as_deref() {
        None => 0,
        Some(cursor) => {
            if cursor.len() > MAX_CURSOR_BYTES {
                return Err(invalid_cursor());
            }
            let Some((cursor_scope, position)) = cursor.rsplit_once(':') else {
                return Err(invalid_cursor());
            };
            if cursor_scope != scope {
                return Err(AppError::StaleCursor(
                    "Author commit cursor belongs to different roots, .mailmap content, or author"
                        .into(),
                ));
            }
            let start = position.parse::<usize>().map_err(|_| invalid_cursor())?;
            if start == 0 || start >= budget || !start.is_multiple_of(AUTHOR_COMMIT_PAGE_SIZE) {
                return Err(invalid_cursor());
            }
            start
        }
    };

    let ids = if let Some(ids) = reader.author_commit_cache.get(active.path(), &scope)? {
        ids
    } else {
        let gathered = with_walk_count(active, &repo, &roots, Some(reader), |walk, count| {
            if count.is_none() {
                return Err(AppError::ResourceLimitExceeded(
                    "History exceeds the author commit ID cache budget".into(),
                ));
            }
            let mut ids = Vec::new();
            for id in walk {
                let id = id?;
                let commit = repo.find_commit(id)?;
                let signature = commit.author();
                let resolved =
                    mailmap.resolve_bytes(signature.name_bytes(), signature.email_bytes());
                if resolved == request.author {
                    ids.push(id);
                }
                if ids.len() > budget {
                    return Err(AppError::ResourceLimitExceeded(
                        "Author commit ID cache budget exceeded".into(),
                    ));
                }
            }
            Ok(ids)
        })?;
        reader
            .author_commit_cache
            .insert(active.path().into(), scope.clone(), gathered, budget)?
    };
    if request.cursor.is_some() && start >= ids.len() {
        return Err(invalid_cursor());
    }
    let end = start.saturating_add(AUTHOR_COMMIT_PAGE_SIZE).min(ids.len());
    let commit_ids = ids
        .get(start..end)
        .ok_or_else(invalid_cursor)?
        .iter()
        .map(ToString::to_string)
        .collect();
    let next_cursor = (end < ids.len()).then(|| format!("{scope}:{end}"));
    Ok(AuthorCommitIdsPage {
        commit_ids,
        next_cursor,
    })
}

fn invalid_cursor() -> AppError {
    AppError::InvalidInput("Invalid author commit cursor".into())
}
fn unavailable_cache() -> AppError {
    AppError::Internal("Author commit cache is unavailable".into())
}
