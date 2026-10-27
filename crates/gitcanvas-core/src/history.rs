//! Deterministic topological history with bounded pages and frozen walk roots.

use std::{
    collections::{BTreeSet, VecDeque},
    path::PathBuf,
    sync::{Arc, Mutex},
};

use git2::{ErrorCode, Oid, Repository, Sort};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use crate::{
    error::AppError,
    pagination::validate_page_size,
    repository::{parse_commit_id, ActiveRepo},
};

/// Maximum number of commits returned by one request.
pub const MAX_PAGE_SIZE: u16 = 500;

/// One commit in the graph. Times are decimal Unix seconds, preserving Git's full integer range.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitInfo {
    /// Full object id of the commit.
    pub id: String,
    /// Parent commit ids in their recorded order.
    pub parents: Vec<String>,
    /// First line of the commit message.
    pub summary: String,
    /// Full commit message.
    pub message: String,
    /// Author display name.
    pub author_name: String,
    /// Author email address.
    pub author_email: String,
    /// Author timestamp in Unix seconds, represented as decimal text.
    pub author_time: String,
    /// Committer timestamp in Unix seconds, represented as decimal text.
    pub commit_time: String,
}

/// Request for a page. Continuations carry the prior page's immutable scope.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HistoryRequest {
    /// Maximum number of commits requested for this page.
    pub limit: u16,
    /// Opaque cursor returned by the preceding page, if any.
    pub cursor: Option<String>,
    /// Walk roots to use when resuming a paged history traversal.
    pub roots: Option<Vec<String>>,
    /// Full reference names selected for the walk; `None` selects every branch, tag and HEAD.
    pub references: Option<Vec<String>>,
}

/// A bounded page and the information needed to resume its exact traversal.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct HistoryPage {
    /// Commits returned in topological history order.
    pub commits: Vec<CommitInfo>,
    /// Cursor for the next page, or `None` when traversal is complete.
    pub next_cursor: Option<String>,
    /// Roots required to resume the history walk.
    pub roots: Vec<String>,
    /// Full reference names resolved for this immutable walk.
    pub references: Vec<String>,
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
/// Maximum refs exposed by the repository snapshot plus the independent HEAD filter.
const MAX_SELECTED_REFERENCES: usize = 20_001;
const MAX_REFERENCE_SCOPE_BYTES: usize = 2 * 1024 * 1024;

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
        // Oversized walks are streamed by the caller and must never enter the
        // cache: evicting every entry cannot make an oversized snapshot fit.
        if self.max_commits == 0 || ids.len() > self.max_commits {
            return Ok(());
        }
        let mut entries = self
            .snapshots
            .lock()
            .map_err(|_| AppError::Internal("History cache is unavailable".into()))?;
        entries.retain(|entry| entry.path != active.path() || entry.roots != roots);
        while entries.len() >= MAX_CACHED_SNAPSHOTS
            || entries
                .iter()
                .map(|entry| entry.ids.len())
                .fold(0usize, usize::saturating_add)
                .saturating_add(ids.len())
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

/// Reads one immutable commit's metadata without walking or paging history.
///
/// # Errors
/// Returns an error when the repository, full commit id or commit object is unavailable.
pub fn get_commit(active: &ActiveRepo, commit_id: &str) -> Result<CommitInfo, AppError> {
    let repo = active.open()?;
    let commit = repo.find_commit(parse_commit_id(commit_id)?)?;
    Ok(commit_info(&commit))
}

fn read_page(
    active: &ActiveRepo,
    request: &HistoryRequest,
    reader: Option<&HistoryReader>,
) -> Result<HistoryPage, AppError> {
    validate_page_size(usize::from(request.limit), usize::from(MAX_PAGE_SIZE))?;
    let repo = active.open()?;
    let parsed_cursor = request.cursor.as_deref().map(parse_cursor).transpose()?;
    let (roots, references) = match (&parsed_cursor, &request.roots, &request.references) {
        (Some((cursor_scope, _)), Some(roots), Some(references)) => {
            if roots.len() > MAX_WALK_ROOTS {
                return Err(AppError::InvalidInput("Too many history roots".into()));
            }
            let roots = roots
                .iter()
                .map(|id| parse_commit_id(id))
                .collect::<Result<Vec<_>, _>>()?;
            let references = normalize_references(references.clone())?;
            let scope = scope_id(&references, &roots)?;
            if cursor_scope != &scope {
                return Err(AppError::StaleCursor(
                    "History cursor belongs to a different reference scope; refresh the history"
                        .into(),
                ));
            }
            (roots, references)
        }
        (None, None, _) => resolve_history_scope(&repo, request.references.as_deref())?,
        (Some(_), _, _) => {
            return Err(AppError::InvalidInput(
                "A history cursor requires its original roots and references".into(),
            ))
        }
        (None, Some(_), _) => {
            return Err(AppError::InvalidInput(
                "Frozen history roots may only be used with a continuation cursor".into(),
            ))
        }
    };
    let cursor = parsed_cursor.map(|(_, id)| id);
    let cached = reader
        .map(|reader| reader.find(active, &roots))
        .transpose()?
        .flatten();
    if let Some(ids) = cached {
        return page_from_walk(
            &repo,
            ids.iter().copied().map(Ok),
            &roots,
            &references,
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
            .take(reader.max_commits.saturating_add(1))
            .collect::<Result<Vec<_>, _>>()?;
        if prefix.len() <= reader.max_commits {
            let ids: WalkIds = prefix.into();
            reader.insert(active, &roots, Arc::clone(&ids))?;
            return page_from_walk(
                &repo,
                ids.iter().copied().map(Ok),
                &roots,
                &references,
                cursor,
                request.limit,
            );
        }
        // Huge walks remain bounded: retain no snapshot, and stream the rest.
        return page_from_walk(
            &repo,
            prefix.into_iter().map(Ok).chain(walk),
            &roots,
            &references,
            cursor,
            request.limit,
        );
    }
    page_from_walk(&repo, walk, &roots, &references, cursor, request.limit)
}

fn page_from_walk(
    repo: &Repository,
    walk: impl Iterator<Item = Result<Oid, git2::Error>>,
    roots: &[Oid],
    references: &[String],
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
    let scope = scope_id(references, roots)?;
    let next_cursor = if more {
        commits
            .last()
            .map(|commit| format!("{scope}:{}", commit.id))
    } else {
        None
    };
    Ok(HistoryPage {
        commits,
        next_cursor,
        roots: roots.iter().map(ToString::to_string).collect(),
        references: references.to_vec(),
    })
}

fn parse_cursor(cursor: &str) -> Result<(String, Oid), AppError> {
    let Some((scope, id)) = cursor.split_once(':') else {
        return Err(AppError::InvalidInput("Invalid history cursor".into()));
    };
    if scope.len() != 64 || !scope.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::InvalidInput(
            "Invalid history cursor scope".into(),
        ));
    }
    Ok((scope.to_ascii_lowercase(), parse_commit_id(id)?))
}

fn scope_id(references: &[String], roots: &[Oid]) -> Result<String, AppError> {
    let roots: Vec<String> = roots.iter().map(ToString::to_string).collect();
    let encoded = serde_json::to_vec(&(references, roots))
        .map_err(|error| AppError::Internal(format!("could not encode history scope: {error}")))?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

fn normalize_references(mut references: Vec<String>) -> Result<Vec<String>, AppError> {
    if references.len() > MAX_SELECTED_REFERENCES {
        return Err(AppError::InvalidInput(
            "Too many selected references".into(),
        ));
    }
    let total_bytes = references.iter().try_fold(0usize, |total, reference| {
        total.checked_add(reference.len())
    });
    if total_bytes.is_none_or(|total| total > MAX_REFERENCE_SCOPE_BYTES) {
        return Err(AppError::InvalidInput(
            "Selected reference names exceed the history scope limit".into(),
        ));
    }
    for reference in &references {
        if reference != "HEAD"
            && (!git2::Reference::is_valid_name(reference)
                || !(reference.starts_with("refs/heads/")
                    || reference.starts_with("refs/remotes/")
                    || reference.starts_with("refs/tags/")))
        {
            return Err(AppError::InvalidInput(
                "Invalid full reference name in history scope".into(),
            ));
        }
    }
    references.sort();
    if references.windows(2).any(|pair| {
        pair.first()
            .zip(pair.get(1))
            .is_some_and(|(left, right)| left == right)
    }) {
        return Err(AppError::InvalidInput(
            "Duplicate reference in history scope".into(),
        ));
    }
    Ok(references)
}

fn resolve_history_scope(
    repo: &Repository,
    selected: Option<&[String]>,
) -> Result<(Vec<Oid>, Vec<String>), AppError> {
    for _ in 0..3 {
        let before = resolve_history_scope_once(repo, selected)?;
        if before == resolve_history_scope_once(repo, selected)? {
            return Ok(before);
        }
    }
    Err(AppError::Conflict(
        "references changed while resolving the history scope; refresh and retry".into(),
    ))
}

fn resolve_history_scope_once(
    repo: &Repository,
    selected: Option<&[String]>,
) -> Result<(Vec<Oid>, Vec<String>), AppError> {
    let references = if let Some(names) = selected {
        normalize_references(names.to_vec())?
    } else {
        let mut names = vec!["HEAD".to_owned()];
        for reference in repo.references()? {
            let reference = reference?;
            if reference.is_branch() || reference.is_remote() || reference.is_tag() {
                let name = reference.name()?;
                names.push(name.to_owned());
            }
        }
        normalize_references(names)?
    };
    let mut roots = BTreeSet::new();
    for name in &references {
        if name == "HEAD" {
            match repo.head() {
                Ok(head) => {
                    roots.insert(head.peel_to_commit()?.id());
                }
                Err(error)
                    if matches!(error.code(), ErrorCode::UnbornBranch | ErrorCode::NotFound) => {}
                Err(error) => return Err(error.into()),
            }
            continue;
        }
        let reference = repo.find_reference(name).map_err(|error| {
            if error.code() == ErrorCode::NotFound {
                AppError::StaleCursor(format!(
                    "Selected reference {name} disappeared; refresh history"
                ))
            } else {
                AppError::from(error)
            }
        })?;
        match reference.peel_to_commit() {
            Ok(commit) => {
                roots.insert(commit.id());
            }
            Err(error)
                if error.code() == ErrorCode::NotFound
                    && (reference.is_branch() || reference.is_remote()) => {}
            Err(error) if error.code() == ErrorCode::InvalidSpec && reference.is_tag() => {}
            Err(error) => return Err(error.into()),
        }
    }
    if roots.len() > MAX_WALK_ROOTS {
        return Err(AppError::ResourceLimitExceeded(
            "too many history roots".into(),
        ));
    }
    Ok((roots.into_iter().collect(), references))
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

    #[test]
    fn cache_skips_zero_budget_and_oversized_snapshots_without_evicting_valid_data() {
        let dir = tempfile::tempdir().unwrap();
        Repository::init(dir.path()).unwrap();
        let active = ActiveRepo::validate(dir.path()).unwrap();
        let zero_budget = HistoryReader::with_budget(0);
        let first = Oid::from_str(&format!("{:040x}", 1)).unwrap();
        zero_budget
            .insert(&active, &[first], vec![first].into())
            .unwrap();
        assert!(zero_budget.snapshots.lock().unwrap().is_empty());

        let reader = HistoryReader::with_budget(2);
        reader
            .insert(&active, &[first], vec![first].into())
            .unwrap();
        let oversized = Oid::from_str(&format!("{:040x}", 2)).unwrap();
        reader
            .insert(&active, &[first], vec![oversized; 3].into())
            .unwrap();
        assert_eq!(reader.snapshots.lock().unwrap().len(), 1);
        assert_eq!(
            reader.find(&active, &[first]).unwrap().unwrap().as_ref(),
            &[first],
            "an oversized replacement must not evict the prior valid snapshot"
        );
    }
}
