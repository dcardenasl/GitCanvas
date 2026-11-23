//! Progressive, independent scan of author identities across frozen history roots.

use std::{
    collections::{BTreeMap, HashSet, VecDeque},
    path::PathBuf,
    sync::{Arc, Mutex},
};

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

/// Number of commits represented by one catalog chunk.
pub const AUTHOR_CATALOG_CHUNK_SIZE: usize = 5_000;
/// Maximum number of distinct identities returned by the full catalog.
pub const MAX_AUTHOR_IDENTITIES: usize = 100_000;

/// A requested continuation of the complete author catalog.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct AuthorCatalogRequest {
    /// Opaque cursor from the previous chunk.
    pub cursor: Option<String>,
    /// Cancellation is observed between requests, never during a libgit2 walk.
    pub cancelled: bool,
}

/// One author and the number of commits attributed to that identity in this delta.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct AuthorCount {
    /// Identity after `.mailmap` resolution.
    pub author: AuthorKey,
    /// Number of commits by this author in the returned chunk.
    #[specta(type = u32)]
    pub commits: u64,
}

/// Why the catalog could not be completed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum IncompleteReason {
    /// The history is larger than the cache budget, so resumable chunks are too expensive.
    HistoryTooLarge,
    /// More than the supported number of distinct author identities exists.
    TooManyAuthors,
    /// The caller cancelled between chunks.
    Cancelled,
}

/// A delta of the full author catalog plus continuation and progress metadata.
#[derive(Debug, Clone, Serialize, Type)]
pub struct AuthorCatalogChunk {
    /// Identities and commit counts discovered in this chunk only.
    pub authors: Vec<AuthorCount>,
    /// Cursor for the next chunk; null when complete or incomplete without continuation.
    pub cursor: Option<String>,
    /// Number of commits scanned across all chunks.
    #[specta(type = u32)]
    pub scanned: u64,
    /// Whether the complete history was scanned.
    pub complete: bool,
    /// Present when scanning stopped before completion.
    pub incomplete_reason: Option<IncompleteReason>,
}

type IdentityHashes = HashSet<[u8; 32]>;

const MAX_CACHED_CATALOGS: usize = 4;

#[derive(Default)]
pub(crate) struct CatalogCache(Mutex<VecDeque<CachedProgress>>);

struct CachedProgress {
    repository: PathBuf,
    scope: String,
    progress: Arc<Mutex<CatalogProgress>>,
}

#[derive(Default)]
struct CatalogProgress {
    scanned: usize,
    seen: IdentityHashes,
}

impl CatalogCache {
    fn progress(
        &self,
        active: &ActiveRepo,
        scope: &str,
    ) -> Result<Arc<Mutex<CatalogProgress>>, AppError> {
        let mut entries = self.0.lock().map_err(|_| unavailable_progress())?;
        if let Some(index) = entries
            .iter()
            .position(|item| item.repository == active.path() && item.scope == scope)
        {
            if let Some(entry) = entries.remove(index) {
                let progress = Arc::clone(&entry.progress);
                entries.push_back(entry);
                return Ok(progress);
            }
        }
        if entries.len() >= MAX_CACHED_CATALOGS {
            entries.pop_front();
        }
        let progress = Arc::new(Mutex::new(CatalogProgress::default()));
        entries.push_back(CachedProgress {
            repository: active.path().into(),
            scope: scope.to_owned(),
            progress: Arc::clone(&progress),
        });
        Ok(progress)
    }
}

/// Reads the next independent delta of the repository's author catalog.
///
/// The history snapshot cache supplies the ordered commit IDs. The catalog
/// retains a bounded cache of recent catalog progress. Retries reuse progress
/// while a continuation after eviction reconstructs the earlier prefix.
///
/// # Errors
/// Returns `StaleCursor` when the reference roots or effective `.mailmap` change.
pub fn get_author_catalog_chunk(
    active: &ActiveRepo,
    request: &AuthorCatalogRequest,
    reader: &HistoryReader,
) -> Result<AuthorCatalogChunk, AppError> {
    read_catalog(
        active,
        request,
        reader,
        AUTHOR_CATALOG_CHUNK_SIZE,
        MAX_AUTHOR_IDENTITIES,
    )
}

fn read_catalog(
    active: &ActiveRepo,
    request: &AuthorCatalogRequest,
    reader: &HistoryReader,
    chunk_size: usize,
    author_limit: usize,
) -> Result<AuthorCatalogChunk, AppError> {
    let repo = active.open()?;
    let (roots, references) = resolve_history_scope(&repo, None)?;
    let mailmap = load_mailmap(&repo);
    let scope = format!(
        "{}:{}",
        scope_id(&references, &roots)?,
        mailmap.content_hash()
    );
    let budget = reader.budget().min(MAX_CACHED_COMMITS);
    let start = match request.cursor.as_deref() {
        None => 0,
        Some(cursor) => {
            let (cursor_scope, start) = parse_cursor(cursor)?;
            if cursor_scope != scope {
                return Err(AppError::StaleCursor(
                    "Author catalog cursor belongs to different roots or .mailmap content".into(),
                ));
            }
            if start == 0 || start > budget || !start.is_multiple_of(chunk_size) {
                return Err(invalid_cursor());
            }
            start
        }
    };

    if request.cancelled {
        return Ok(incomplete(start, IncompleteReason::Cancelled, Vec::new()));
    }

    with_walk_count(active, &repo, &roots, Some(reader), |walk, count| {
        let Some(count) = count.filter(|count| *count <= budget) else {
            return Ok(incomplete(0, IncompleteReason::HistoryTooLarge, Vec::new()));
        };
        if start > 0 && start >= count {
            return Err(invalid_cursor());
        }

        let progress = reader.catalog_cache.progress(active, &scope)?;
        let mut progress = progress.lock().map_err(|_| unavailable_progress())?;
        let known = start.min(progress.scanned);
        if known > 0 {
            walk.nth(known.saturating_sub(1))
                .ok_or_else(invalid_cursor)??;
        }

        for id in (&mut *walk).take(start.saturating_sub(known)) {
            let author = author_at(&repo, &mailmap, id?)?;
            if !record_identity(&mut progress.seen, &author, author_limit) {
                return Ok(incomplete(
                    progress.scanned,
                    IncompleteReason::TooManyAuthors,
                    Vec::new(),
                ));
            }
            progress.scanned = progress.scanned.saturating_add(1);
        }

        let mut scanned = start;
        let mut authors = BTreeMap::<AuthorKey, u64>::new();
        for id in walk.take(chunk_size) {
            let author = author_at(&repo, &mailmap, id?)?;
            if scanned >= progress.scanned {
                if !record_identity(&mut progress.seen, &author, author_limit) {
                    return Ok(incomplete(
                        scanned,
                        IncompleteReason::TooManyAuthors,
                        counts(authors),
                    ));
                }
                progress.scanned = progress.scanned.saturating_add(1);
            }
            let author_count = authors.entry(author).or_default();
            *author_count = author_count.saturating_add(1);
            scanned = scanned.saturating_add(1);
        }
        let complete = scanned == count;
        Ok(AuthorCatalogChunk {
            authors: counts(authors),
            cursor: (!complete).then(|| format!("{scope}:{scanned}")),
            scanned: scanned as u64,
            complete,
            incomplete_reason: None,
        })
    })
}

fn author_at(
    repo: &git2::Repository,
    mailmap: &crate::authors::LoadedMailmap,
    id: git2::Oid,
) -> Result<AuthorKey, AppError> {
    let commit = repo.find_commit(id)?;
    let signature = commit.author();
    Ok(mailmap.resolve_bytes(signature.name_bytes(), signature.email_bytes()))
}

fn counts(authors: BTreeMap<AuthorKey, u64>) -> Vec<AuthorCount> {
    authors
        .into_iter()
        .map(|(author, commits)| AuthorCount { author, commits })
        .collect()
}

fn record_identity(seen: &mut IdentityHashes, author: &AuthorKey, limit: usize) -> bool {
    let mut hash = Sha256::new();
    hash.update((author.name.len() as u64).to_le_bytes());
    hash.update(author.name.as_bytes());
    hash.update(author.email.as_bytes());
    let digest: [u8; 32] = hash.finalize().into();
    if seen.len() >= limit {
        return seen.contains(&digest);
    }
    seen.insert(digest);
    true
}

fn incomplete(
    scanned: usize,
    reason: IncompleteReason,
    authors: Vec<AuthorCount>,
) -> AuthorCatalogChunk {
    AuthorCatalogChunk {
        authors,
        cursor: None,
        scanned: scanned as u64,
        complete: false,
        incomplete_reason: Some(reason),
    }
}

fn parse_cursor(value: &str) -> Result<(&str, usize), AppError> {
    if value.len() > 160 {
        return Err(invalid_cursor());
    }
    let (scope, scanned) = value.rsplit_once(':').ok_or_else(invalid_cursor)?;
    let scanned = scanned.parse().map_err(|_| invalid_cursor())?;
    Ok((scope, scanned))
}

fn invalid_cursor() -> AppError {
    AppError::InvalidInput("Invalid author catalog cursor".into())
}

fn unavailable_progress() -> AppError {
    AppError::Internal("Author catalog cache is unavailable".into())
}

#[cfg(test)]
mod tests {
    use git2::{Repository, Signature};

    use super::*;

    #[test]
    fn distinct_author_limit_applies_across_chunks_and_survives_cache_eviction() {
        let directory = tempfile::tempdir().unwrap();
        let repo = Repository::init(directory.path()).unwrap();
        let tree = repo
            .find_tree(repo.treebuilder(None).unwrap().write().unwrap())
            .unwrap();
        let mut previous = None;
        for name in ["One", "Two", "Three"] {
            let signature = Signature::now(name, "author@example.test").unwrap();
            let parents: Vec<_> = previous.iter().collect();
            let id = repo
                .commit(Some("HEAD"), &signature, &signature, name, &tree, &parents)
                .unwrap();
            previous = Some(repo.find_commit(id).unwrap());
        }
        let active = ActiveRepo::validate(directory.path()).unwrap();
        let reader = HistoryReader::default();
        let first = read_catalog(&active, &AuthorCatalogRequest::default(), &reader, 2, 2).unwrap();
        assert_eq!(first.scanned, 2);
        assert_eq!(first.authors.len(), 2);
        let cursor = first.cursor.unwrap();
        assert!(cursor.len() <= 160);
        let continuation = AuthorCatalogRequest {
            cursor: Some(cursor),
            cancelled: false,
        };

        for cache in [&reader, &HistoryReader::default()] {
            let next = read_catalog(&active, &continuation, cache, 2, 2).unwrap();
            assert_eq!(next.scanned, 2);
            assert_eq!(
                next.incomplete_reason,
                Some(IncompleteReason::TooManyAuthors)
            );
            assert!(!next.complete);
            assert!(next.authors.is_empty());
            assert!(next.cursor.is_none());
        }
    }

    #[test]
    fn production_author_limit_accepts_the_boundary_and_denies_the_next_identity() {
        let mut seen = IdentityHashes::new();
        let mut author = AuthorKey {
            name: String::new(),
            email: "same-email@example.test".into(),
        };
        for index in 0..100_000 {
            author.name = format!("Author {index}");
            assert!(record_identity(&mut seen, &author, MAX_AUTHOR_IDENTITIES));
        }
        assert_eq!(seen.len(), 100_000);
        assert!(record_identity(&mut seen, &author, MAX_AUTHOR_IDENTITIES));
        author.name = "One more".into();
        assert!(!record_identity(&mut seen, &author, MAX_AUTHOR_IDENTITIES));
        assert_eq!(seen.len(), 100_000);
    }

    #[test]
    fn malformed_signature_fields_keep_distinct_identities() {
        let directory = tempfile::tempdir().unwrap();
        let repo = Repository::init(directory.path()).unwrap();
        let mailmap = load_mailmap(&repo);
        let a = mailmap.resolve_bytes(b"\xff", b"author@example.test");
        let b = mailmap.resolve_bytes(b"\xfe", b"author@example.test");
        let literal = mailmap.resolve_bytes(b"ff", b"author@example.test");
        assert_ne!(a, b);
        assert_ne!(a, literal);
    }

    #[test]
    fn one_exact_chunk_is_complete_without_an_extra_request() {
        let directory = tempfile::tempdir().unwrap();
        let repo = Repository::init(directory.path()).unwrap();
        let tree = repo
            .find_tree(repo.treebuilder(None).unwrap().write().unwrap())
            .unwrap();
        let signature = Signature::now("One", "author@example.test").unwrap();
        repo.commit(Some("HEAD"), &signature, &signature, "one", &tree, &[])
            .unwrap();
        let active = ActiveRepo::validate(directory.path()).unwrap();
        let result = read_catalog(
            &active,
            &AuthorCatalogRequest::default(),
            &HistoryReader::default(),
            1,
            2,
        )
        .unwrap();
        assert!(result.complete);
        assert_eq!(result.scanned, 1);
        assert!(result.cursor.is_none());
    }
}
