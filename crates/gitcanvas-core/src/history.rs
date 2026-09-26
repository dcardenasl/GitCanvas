//! Deterministic topological history with bounded pages and frozen walk roots.

use std::{
    collections::{BTreeSet, VecDeque},
    path::PathBuf,
    sync::{Arc, Mutex},
};

use git2::{ErrorCode, Oid, Repository, Sort};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, repository::ActiveRepo};

/// Maximum number of commits returned by one request.
pub const MAX_PAGE_SIZE: u16 = 500;

/// One commit in the graph. Times are decimal Unix seconds, preserving Git's full integer range.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitInfo {
    pub id: String,
    pub parents: Vec<String>,
    pub summary: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub author_time: String,
    pub commit_time: String,
}

/// Request for a page. Continuations carry the prior page's immutable walk roots.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HistoryRequest {
    pub limit: u16,
    pub cursor: Option<String>,
    pub roots: Option<Vec<String>>,
}

/// A bounded page and the information needed to resume its exact traversal.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HistoryPage {
    pub commits: Vec<CommitInfo>,
    pub next_cursor: Option<String>,
    pub roots: Vec<String>,
}

/// Commit IDs retained across all cached walks: 2,000,000 IDs, about 40 MB.
///
/// libgit2 cannot hand out a topological walk lazily. Before it yields the
/// first commit it has to visit the whole history to know each commit's
/// children, so resuming a walk costs a full traversal no matter which page is
/// wanted. Caching the ordered IDs turns every later page into a slice; a
/// history longer than this still works, but each of its pages repeats the
/// traversal. The budget covers the largest repositories in common use.
const MAX_CACHED_COMMITS: usize = 2_000_000;
const MAX_CACHED_SNAPSHOTS: usize = 8;
/// Walk roots a continuation may carry. Roots are branches, tags and HEAD, so
/// this is far above any real repository while still bounding a hostile request.
const MAX_WALK_ROOTS: usize = 10_000;

type WalkIds = Arc<[Oid]>;

struct Snapshot {
    path: PathBuf,
    roots: Vec<Oid>,
    ids: WalkIds,
}

/// Bounded LRU of immutable traversal IDs. Contains no live repository handles.
///
/// Reusing a reader avoids walking every ancestor again for each page. Identity
/// includes the canonical path and frozen roots; ref changes naturally miss the
/// cache. At most 2,000,000 IDs and eight snapshots are retained across repositories.
pub struct HistoryReader {
    snapshots: Mutex<VecDeque<Snapshot>>,
    max_commits: usize,
}

impl Default for HistoryReader {
    fn default() -> Self {
        Self::with_budget(MAX_CACHED_COMMITS)
    }
}

impl HistoryReader {
    /// A reader that retains at most `max_commits` IDs, so the path taken by
    /// histories larger than the budget can be exercised without millions of
    /// commits.
    #[must_use]
    pub fn with_budget(max_commits: usize) -> Self {
        Self {
            snapshots: Mutex::default(),
            max_commits,
        }
    }

    /// Reads a bounded page, reusing only immutable commit IDs from prior walks.
    ///
    /// # Errors
    /// Rejects invalid limits/cursors and reports repository or object failures.
    pub fn get_commits(
        &self,
        active: &ActiveRepo,
        request: &HistoryRequest,
    ) -> Result<HistoryPage, AppError> {
        read_page(active, request, Some(self))
    }

    fn find(&self, active: &ActiveRepo, roots: &[Oid]) -> Result<Option<WalkIds>, AppError> {
        let mut entries = self
            .snapshots
            .lock()
            .map_err(|_| AppError::Internal("History cache is unavailable".into()))?;
        let Some(index) = entries
            .iter()
            .position(|entry| entry.path == active.path() && entry.roots == roots)
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

    fn insert(&self, active: &ActiveRepo, roots: &[Oid], ids: WalkIds) -> Result<(), AppError> {
        let mut entries = self
            .snapshots
            .lock()
            .map_err(|_| AppError::Internal("History cache is unavailable".into()))?;
        entries.retain(|entry| entry.path != active.path() || entry.roots != roots);
        while entries.len() >= MAX_CACHED_SNAPSHOTS
            || entries.iter().map(|entry| entry.ids.len()).sum::<usize>() + ids.len()
                > self.max_commits
        {
            entries.pop_front();
        }
        entries.push_back(Snapshot {
            path: active.path().into(),
            roots: roots.to_vec(),
            ids,
        });
        Ok(())
    }
}

/// Reads commits reachable from HEAD, branches and commit tags without retaining a cache.
/// Use a shared `HistoryReader` for repeated application requests.
///
/// A SHA alone cannot encode the frontier of a topological walk. Frozen roots
/// preserve divergent branches even when refs move between pages.
///
/// # Errors
/// Rejects invalid limits, incomplete continuations and unreachable cursors.
pub fn get_commits(active: &ActiveRepo, request: &HistoryRequest) -> Result<HistoryPage, AppError> {
    read_page(active, request, None)
}

fn read_page(
    active: &ActiveRepo,
    request: &HistoryRequest,
    reader: Option<&HistoryReader>,
) -> Result<HistoryPage, AppError> {
    if request.limit == 0 || request.limit > MAX_PAGE_SIZE {
        return Err(AppError::InvalidInput(format!(
            "Page size must be between 1 and {MAX_PAGE_SIZE}"
        )));
    }
    if request.cursor.is_some() && request.roots.is_none() {
        return Err(AppError::InvalidInput(
            "A cursor requires its original walk roots".into(),
        ));
    }
    let repo = active.open()?;
    let roots = match &request.roots {
        Some(roots) => {
            if roots.len() > MAX_WALK_ROOTS {
                return Err(AppError::InvalidInput("Too many history roots".into()));
            }
            roots
                .iter()
                .map(|id| parse_oid(id))
                .collect::<Result<Vec<_>, _>>()?
        }
        None => history_roots(&repo)?,
    };
    let cursor = request.cursor.as_deref().map(parse_oid).transpose()?;
    let cached = reader
        .map(|reader| reader.find(active, &roots))
        .transpose()?
        .flatten();
    if let Some(ids) = cached {
        return page_from_walk(
            &repo,
            ids.iter().copied().map(Ok),
            &roots,
            cursor,
            request.limit,
        );
    }
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    for root in &roots {
        walk.push(*root).map_err(|_| {
            AppError::StaleCursor(
                "A history root is no longer available; refresh the repository".into(),
            )
        })?;
    }
    if let Some(reader) = reader {
        let prefix = walk
            .by_ref()
            .take(reader.max_commits + 1)
            .collect::<Result<Vec<_>, _>>()?;
        if prefix.len() <= reader.max_commits {
            let ids: WalkIds = prefix.into();
            reader.insert(active, &roots, Arc::clone(&ids))?;
            return page_from_walk(
                &repo,
                ids.iter().copied().map(Ok),
                &roots,
                cursor,
                request.limit,
            );
        }
        // Huge walks remain bounded: retain no snapshot, and stream the rest.
        return page_from_walk(
            &repo,
            prefix.into_iter().map(Ok).chain(walk),
            &roots,
            cursor,
            request.limit,
        );
    }
    page_from_walk(&repo, walk, &roots, cursor, request.limit)
}

fn page_from_walk(
    repo: &Repository,
    walk: impl Iterator<Item = Result<Oid, git2::Error>>,
    roots: &[Oid],
    cursor: Option<Oid>,
    limit: u16,
) -> Result<HistoryPage, AppError> {
    let mut found_cursor = cursor.is_none();
    let mut commits = Vec::with_capacity(usize::from(limit));
    let mut more = false;
    for id in walk {
        let id = id?;
        if !found_cursor {
            found_cursor = Some(id) == cursor;
            continue;
        }
        if commits.len() == usize::from(limit) {
            more = true;
            break;
        }
        commits.push(commit_info(&repo.find_commit(id)?));
    }
    if !found_cursor {
        return Err(AppError::StaleCursor(
            "Cursor is not reachable from the supplied history roots".into(),
        ));
    }
    let next_cursor = if more {
        commits.last().map(|commit| commit.id.clone())
    } else {
        None
    };
    Ok(HistoryPage {
        commits,
        next_cursor,
        roots: roots.iter().map(ToString::to_string).collect(),
    })
}

pub(crate) fn parse_oid(value: &str) -> Result<Oid, AppError> {
    if value.len() != 40 {
        return Err(AppError::InvalidInput(
            "Expected a complete 40-character commit SHA".into(),
        ));
    }
    Oid::from_str(value).map_err(|_| AppError::InvalidInput("Invalid commit SHA".into()))
}

fn history_roots(repo: &Repository) -> Result<Vec<Oid>, AppError> {
    let mut roots = BTreeSet::new();
    match repo.head() {
        Ok(head) => {
            roots.insert(head.peel_to_commit()?.id());
        }
        Err(error) if matches!(error.code(), ErrorCode::UnbornBranch | ErrorCode::NotFound) => {}
        Err(error) => return Err(error.into()),
    }
    for reference in repo.references()? {
        let reference = reference?;
        if reference.is_branch() || reference.is_remote() || reference.is_tag() {
            match reference.peel_to_commit() {
                Ok(commit) => {
                    roots.insert(commit.id());
                }
                // Tags may legally point at trees or blobs. They have no history.
                Err(error) if reference.is_tag() && error.code() == ErrorCode::InvalidSpec => {}
                Err(error) => return Err(error.into()),
            }
        }
    }
    Ok(roots.into_iter().collect())
}

pub(crate) fn commit_info(commit: &git2::Commit<'_>) -> CommitInfo {
    let author = commit.author();
    CommitInfo {
        id: commit.id().to_string(),
        parents: commit.parent_ids().map(|id| id.to_string()).collect(),
        summary: String::from_utf8_lossy(commit.summary_bytes().unwrap_or_default()).into_owned(),
        message: String::from_utf8_lossy(commit.message_bytes()).into_owned(),
        author_name: String::from_utf8_lossy(author.name_bytes()).into_owned(),
        author_email: String::from_utf8_lossy(author.email_bytes()).into_owned(),
        author_time: author.when().seconds().to_string(),
        commit_time: commit.time().seconds().to_string(),
    }
}

#[cfg(test)]
mod cache_tests {
    use super::*;

    #[test]
    fn cache_evicts_old_snapshots_and_limits_total_ids() {
        let dir = tempfile::tempdir().unwrap();
        Repository::init(dir.path()).unwrap();
        let active = ActiveRepo::validate(dir.path()).unwrap();
        let reader = HistoryReader::default();
        // Each snapshot takes a fifth of the budget, so only five fit.
        let chunk = MAX_CACHED_COMMITS / 5;
        for value in 0..10 {
            let id = Oid::from_str(&format!("{value:040x}")).unwrap();
            reader
                .insert(&active, &[id], vec![id; chunk].into())
                .unwrap();
        }
        let entries = reader.snapshots.lock().unwrap();
        assert_eq!(entries.len(), 5);
        assert_eq!(
            entries.iter().map(|entry| entry.ids.len()).sum::<usize>(),
            MAX_CACHED_COMMITS
        );
    }

    #[test]
    fn cache_reuses_ids_and_updates_lru_without_crossing_repository_boundaries() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        Repository::init(first.path()).unwrap();
        Repository::init(second.path()).unwrap();
        let active = ActiveRepo::validate(first.path()).unwrap();
        let other = ActiveRepo::validate(second.path()).unwrap();
        let reader = HistoryReader::default();
        let first_id = Oid::ZERO_SHA1;
        let ids: WalkIds = vec![first_id].into();
        reader
            .insert(&active, &[first_id], Arc::clone(&ids))
            .unwrap();
        assert!(Arc::ptr_eq(
            &reader.find(&active, &[first_id]).unwrap().unwrap(),
            &ids
        ));
        assert!(reader.find(&other, &[first_id]).unwrap().is_none());
        for value in 1..8 {
            let id = Oid::from_str(&format!("{value:040x}")).unwrap();
            reader.insert(&active, &[id], vec![id].into()).unwrap();
        }
        reader.find(&active, &[first_id]).unwrap();
        let newest = Oid::from_str(&format!("{:040x}", 8)).unwrap();
        reader
            .insert(&active, &[newest], vec![newest].into())
            .unwrap();
        assert_eq!(reader.snapshots.lock().unwrap().len(), MAX_CACHED_SNAPSHOTS);
        assert!(reader.find(&active, &[first_id]).unwrap().is_some());
        let evicted = Oid::from_str(&format!("{:040x}", 1)).unwrap();
        assert!(reader.find(&active, &[evicted]).unwrap().is_none());
    }
}
