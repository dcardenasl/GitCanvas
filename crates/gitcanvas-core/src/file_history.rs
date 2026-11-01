//! Per-file history: the commits that changed one path, simplified the way
//! `git log -- <path>` simplifies by default. Renames are not followed yet.
//!
//! A request examines a bounded number of commits and ends with a stateless
//! cursor: the last commit examined plus the frontier of followed commits not
//! yet reached. Nothing is kept on the server between pages, so cache eviction
//! can never change a result. See ADR 0008.

use std::{
    collections::{BTreeSet, HashMap},
    path::{Component, Path},
};

use git2::{ErrorCode, ObjectType, Oid, Repository};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use crate::{
    error::AppError,
    history::{commit_info, with_walk, CommitInfo, HistoryReader},
    pagination::validate_page_size,
    repository::{parse_commit_id, validate_relative_path, ActiveRepo},
};

/// Largest page of file history one request may return.
pub const MAX_FILE_HISTORY_PAGE_SIZE: u16 = 200;
/// Longest repository-relative path accepted, in bytes (ADR 0002).
pub const MAX_PATH_BYTES: usize = 4_096;
/// Commits examined per request before the page ends with `Truncation::WorkLimit`.
pub const MAX_EXAMINED_PER_REQUEST: u32 = 20_000;
/// Followed commits still waiting to be reached. Past this the query ends with
/// `Truncation::FrontierLimit`, because the remaining history can no longer be
/// resumed from a bounded cursor.
pub const MAX_FRONTIER: u32 = 256;
/// Ids retained for file history. This is a cache partition of its own: the
/// graph's budget never changes because of it.
pub const FILE_HISTORY_CACHED_COMMITS: usize = 500_000;

/// Work bounds for one request. Production uses [`Budget::DEFAULT`]; tests use
/// small values to reach the limits without building enormous histories.
#[derive(Debug, Clone, Copy)]
struct Budget {
    examined: u32,
    frontier: u32,
}

impl Budget {
    const DEFAULT: Self = Self {
        examined: MAX_EXAMINED_PER_REQUEST,
        frontier: MAX_FRONTIER,
    };
}

/// A request for one page of the history of one path.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileHistoryRequest {
    /// Repository-relative path of a file, exactly as Git stores it.
    pub path: String,
    /// Full id of the commit the history starts from, normally the checked-out HEAD.
    pub start: String,
    /// Maximum rows requested for this page.
    pub limit: u16,
    /// Cursor from the preceding page of this same path and start commit.
    pub cursor: Option<String>,
    /// Commit to locate. The page containing it is returned; only valid without a cursor.
    pub focus_commit: Option<String>,
}

/// How a commit changed the path, compared with its first parent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PathChange {
    /// The path did not exist in the first parent.
    Added,
    /// The path exists in both, with a different blob or file mode.
    Modified,
    /// The path existed in the first parent and is absent here.
    Deleted,
}

/// One commit that changed the path.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileHistoryRow {
    /// Commit metadata, the same shape the graph uses.
    pub commit: CommitInfo,
    /// Change relative to the first parent, for merges too.
    pub change: PathChange,
    /// Whether the commit has more than one parent.
    pub is_merge: bool,
}

/// Why a page ended early. A page without truncation and without a cursor is complete.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Truncation {
    /// The request examined its commit budget; the cursor resumes the search.
    WorkLimit,
    /// Too many followed commits are pending; the search cannot be resumed.
    FrontierLimit,
}

/// Outcome of a `focus_commit` lookup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum FocusOutcome {
    /// The commit is listed; the returned page contains it.
    Found,
    /// The history ended without listing the commit under simplification.
    NotShown,
    /// The commit budget ran out before it was reached; the list starts at the top.
    OutsideBudget,
}

/// Bounds the engine enforces, published so the interface never copies them.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type)]
pub struct FileHistoryLimits {
    /// Largest accepted page size.
    pub max_page_size: u16,
    /// Commits examined per request.
    pub max_examined: u32,
    /// Followed commits that may be pending at once.
    pub max_frontier: u32,
}

/// One page of a file's history.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileHistoryPage {
    /// Changing commits in history order.
    pub rows: Vec<FileHistoryRow>,
    /// Cursor for the next page, present when more rows may follow.
    pub next_cursor: Option<String>,
    /// Set when the page ended early because of a bound.
    pub truncation: Option<Truncation>,
    /// Set when a `focus_commit` was requested.
    pub focus: Option<FocusOutcome>,
    /// Full id of the commit the history starts from.
    pub start: String,
    /// Whether the repository is shallow: the oldest row is not necessarily where the file began.
    pub shallow: bool,
    /// Bounds in force for this response.
    pub limits: FileHistoryLimits,
}

/// Returns one page of the history of `request.path`, starting at `request.start`.
///
/// `reader` is the file-history cache partition; pass `None` to walk without caching.
///
/// # Errors
/// Rejects invalid paths, page sizes and commit ids; a path that is a directory,
/// submodule, or has no history from the start commit; and cursors that do not
/// match this query or whose position is no longer reachable.
pub fn get_file_history(
    active: &ActiveRepo,
    reader: Option<&HistoryReader>,
    request: &FileHistoryRequest,
) -> Result<FileHistoryPage, AppError> {
    file_history(active, reader, request, Budget::DEFAULT)
}

fn file_history(
    active: &ActiveRepo,
    reader: Option<&HistoryReader>,
    request: &FileHistoryRequest,
    budget: Budget,
) -> Result<FileHistoryPage, AppError> {
    validate_page_size(
        usize::from(request.limit),
        usize::from(MAX_FILE_HISTORY_PAGE_SIZE),
    )?;
    validate_path(&request.path)?;
    let start = parse_commit_id(&request.start)?;
    let repo = active.open()?;
    let start_commit = repo.find_commit(start).map_err(|error| {
        if error.code() == ErrorCode::NotFound {
            AppError::StaleCursor("The start commit is no longer in the repository".into())
        } else {
            error.into()
        }
    })?;
    let scope = scope_id(&request.path, start)?;
    let cursor = request.cursor.as_deref().map(parse_cursor).transpose()?;
    if let Some(cursor) = &cursor {
        if cursor.scope != scope {
            return Err(AppError::StaleCursor(
                "File history cursor belongs to a different path or start commit".into(),
            ));
        }
    }
    let focus = request
        .focus_commit
        .as_deref()
        .map(parse_commit_id)
        .transpose()?;
    if focus.is_some() && cursor.is_some() {
        return Err(AppError::InvalidInput(
            "A focus commit applies only to the first page".into(),
        ));
    }
    if cursor.is_none()
        && path_entry(&start_commit, &request.path)?
            .is_some_and(|entry| matches!(entry.kind, Some(ObjectType::Tree | ObjectType::Commit)))
    {
        return Err(AppError::InvalidInput(
            "The path is a directory or submodule, not a file".into(),
        ));
    }

    let limit = usize::from(request.limit);
    let run = |position: Position, query: Query| {
        with_walk(active, &repo, &[start], reader, |walk| {
            pass(&repo, &request.path, walk, position, &query, budget)
        })
    };
    let (position, skip, focus_outcome) = match (focus, cursor) {
        (Some(target), None) => {
            let (skip, outcome) = focus_offset(&run, start, target, limit)?;
            (Position::top(start), skip, Some(outcome))
        }
        (_, Some(cursor)) => (
            Position {
                last: Some(cursor.last),
                followed: cursor.frontier,
            },
            0,
            None,
        ),
        (None, None) => (Position::top(start), 0, None),
    };
    let page = run(
        position,
        Query {
            skip,
            take: Some(limit),
            focus: None,
        },
    )?;
    if matches!(page.stop, Stop::Exhausted) && page.emitted == 0 && request.cursor.is_none() {
        return Err(AppError::InvalidInput(
            "The path has no history at or before the start commit".into(),
        ));
    }
    let (next_cursor, truncation) = page_end(&scope, &page)?;
    Ok(FileHistoryPage {
        rows: page.rows,
        next_cursor,
        truncation,
        focus: focus_outcome,
        start: start.to_string(),
        shallow: repo.is_shallow(),
        limits: FileHistoryLimits {
            max_page_size: MAX_FILE_HISTORY_PAGE_SIZE,
            max_examined: budget.examined,
            max_frontier: budget.frontier,
        },
    })
}

/// Finds `target` from the top of the history. Returns how many rows precede
/// the page that contains it, and whether it was found at all.
fn focus_offset(
    run: &impl Fn(Position, Query) -> Result<Pass, AppError>,
    start: Oid,
    target: Oid,
    limit: usize,
) -> Result<(usize, FocusOutcome), AppError> {
    let probe = run(
        Position::top(start),
        Query {
            skip: 0,
            take: None,
            focus: Some(target),
        },
    )?;
    Ok(match probe.stop {
        Stop::Focus(index) => (page_offset(index, limit), FocusOutcome::Found),
        Stop::Exhausted => (0, FocusOutcome::NotShown),
        _ => (0, FocusOutcome::OutsideBudget),
    })
}

/// The cursor and truncation that close a page. A page query carries no focus,
/// so `Stop::Focus` never ends one.
fn page_end(scope: &str, page: &Pass) -> Result<(Option<String>, Option<Truncation>), AppError> {
    Ok(match page.stop {
        Stop::Exhausted | Stop::Focus(_) => (None, None),
        Stop::Full => (Some(encode_cursor(scope, page.last, &page.followed)?), None),
        Stop::WorkLimit => (
            Some(encode_cursor(scope, page.last, &page.followed)?),
            Some(Truncation::WorkLimit),
        ),
        Stop::FrontierLimit => (None, Some(Truncation::FrontierLimit)),
    })
}

/// Rejects everything that is not an exact, relative file path in the repository.
fn validate_path(path: &str) -> Result<(), AppError> {
    let invalid = |reason: &str| AppError::InvalidInput(format!("Invalid file path: {reason}"));
    if path.len() > MAX_PATH_BYTES {
        return Err(invalid("path is too long"));
    }
    if path.ends_with('/') {
        return Err(invalid("a directory is not a file"));
    }
    let relative = validate_relative_path(path)
        .map_err(|_| invalid("it must be relative to the repository"))?;
    if relative
        .components()
        .any(|component| matches!(component, Component::CurDir))
    {
        return Err(invalid("it must not contain \".\" components"));
    }
    Ok(())
}

/// Where a pass resumes: the last commit already examined and the followed
/// commits that are still waiting to be reached.
#[derive(Debug, Clone)]
struct Position {
    last: Option<Oid>,
    followed: BTreeSet<Oid>,
}

impl Position {
    /// The beginning of the walk: only the start commit is followed.
    fn top(start: Oid) -> Self {
        Self {
            last: None,
            followed: BTreeSet::from([start]),
        }
    }
}

/// What one pass returns: `skip` emissions are discarded, then up to `take`
/// rows are collected. `take: None` only locates `focus`.
struct Query {
    skip: usize,
    take: Option<usize>,
    focus: Option<Oid>,
}

#[derive(Debug, PartialEq, Eq)]
enum Stop {
    /// The walk ended.
    Exhausted,
    /// The page is full; the next commit is a row that starts the following page.
    Full,
    /// The examined budget ran out before the next commit.
    WorkLimit,
    /// The frontier grew past its bound.
    FrontierLimit,
    /// The focus commit was emitted at this emission index.
    Focus(usize),
}

struct Pass {
    rows: Vec<FileHistoryRow>,
    emitted: usize,
    stop: Stop,
    last: Option<Oid>,
    followed: BTreeSet<Oid>,
}

/// Walks the commits in order from `position`, applying the simplification rule
/// to each followed commit. Each commit is examined at most once per request.
fn pass(
    repo: &Repository,
    path: &str,
    walk: &mut dyn Iterator<Item = Result<Oid, git2::Error>>,
    position: Position,
    query: &Query,
    budget: Budget,
) -> Result<Pass, AppError> {
    let Position {
        last: resume_after,
        mut followed,
    } = position;
    let mut entries = Entries {
        repo,
        path,
        memo: HashMap::new(),
    };
    let mut awaiting = resume_after;
    let mut last = resume_after;
    let mut examined: u32 = 0;
    let mut emitted = 0usize;
    let mut rows = Vec::new();
    let mut stop = Stop::Exhausted;
    for item in &mut *walk {
        let id = item?;
        // Positions up to and including the cursor were already examined.
        if let Some(target) = awaiting {
            if id == target {
                awaiting = None;
            }
            continue;
        }
        if examined >= budget.examined {
            stop = Stop::WorkLimit;
            break;
        }
        examined = examined.saturating_add(1);
        if !followed.contains(&id) {
            last = Some(id);
            continue;
        }
        let (commit, verdict) = judge(repo, &mut entries, id)?;
        if let Some(change) = verdict.change {
            if query.focus == Some(id) {
                stop = Stop::Focus(emitted);
                break;
            }
            if emitted >= query.skip {
                if let Some(take) = query.take {
                    if rows.len() >= take {
                        // Stop before this commit so the cursor resumes at it.
                        stop = Stop::Full;
                        break;
                    }
                    rows.push(FileHistoryRow {
                        commit: commit_info(&commit),
                        change,
                        is_merge: verdict.is_merge,
                    });
                }
            }
            emitted = emitted.saturating_add(1);
        }
        followed.remove(&id);
        followed.extend(verdict.follow);
        last = Some(id);
        if u32::try_from(followed.len()).unwrap_or(u32::MAX) > budget.frontier {
            stop = Stop::FrontierLimit;
            break;
        }
    }
    if awaiting.is_some() {
        return Err(AppError::StaleCursor(
            "File history cursor position is no longer reachable; refresh the history".into(),
        ));
    }
    if stop == Stop::Exhausted && !followed.is_empty() {
        return Err(AppError::StaleCursor(
            "File history cursor frontier is no longer reachable; refresh the history".into(),
        ));
    }
    Ok(Pass {
        rows,
        emitted,
        stop,
        last,
        followed,
    })
}

/// The simplification decision for one followed commit.
struct Verdict {
    /// The change to emit, or `None` when the commit is TREESAME to a parent.
    change: Option<PathChange>,
    is_merge: bool,
    /// Parents this commit makes followed.
    follow: Vec<Oid>,
}

/// Compares the path entry with each parent, as `git log -- <path>` does: a
/// commit identical to some parent is hidden and only that parent is followed;
/// otherwise it is emitted and every parent is followed.
fn judge<'repo>(
    repo: &'repo Repository,
    entries: &mut Entries<'_>,
    id: Oid,
) -> Result<(git2::Commit<'repo>, Verdict), AppError> {
    let commit = repo.find_commit(id)?;
    let entry = entries.entry_of(id)?;
    let parents: Vec<Oid> = commit.parent_ids().collect();
    let is_merge = parents.len() > 1;
    let Some(&first) = parents.first() else {
        let change = entry.map(|_| PathChange::Added);
        return Ok((
            commit,
            Verdict {
                change,
                is_merge,
                follow: Vec::new(),
            },
        ));
    };
    let first_entry = entries.entry_of(first)?;
    let mut same_as = (first_entry == entry).then_some(first);
    if same_as.is_none() {
        for parent in parents.iter().skip(1) {
            if entries.entry_of(*parent)? == entry {
                same_as = Some(*parent);
                break;
            }
        }
    }
    let verdict = match same_as {
        Some(parent) => Verdict {
            change: None,
            is_merge,
            follow: vec![parent],
        },
        None => Verdict {
            change: Some(change_between(first_entry, entry)),
            is_merge,
            follow: parents,
        },
    };
    Ok((commit, verdict))
}

/// A tree entry's identity: its object, its mode, and what kind of object it is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Entry {
    id: Oid,
    mode: i32,
    kind: Option<ObjectType>,
}

/// Path entries of the commits one pass has already read. A commit is read once
/// as a parent and again when it is judged; the memo makes the second read free.
struct Entries<'a> {
    repo: &'a Repository,
    path: &'a str,
    memo: HashMap<Oid, Option<Entry>>,
}

impl Entries<'_> {
    fn entry_of(&mut self, id: Oid) -> Result<Option<Entry>, AppError> {
        if let Some(entry) = self.memo.get(&id) {
            return Ok(*entry);
        }
        let entry = path_entry(&self.repo.find_commit(id)?, self.path)?;
        self.memo.insert(id, entry);
        Ok(entry)
    }
}

/// Looks the path up in the commit's tree. A missing path is `None`, not an error.
fn path_entry(commit: &git2::Commit<'_>, path: &str) -> Result<Option<Entry>, AppError> {
    let tree = commit.tree()?;
    match tree.get_path(Path::new(path)) {
        Ok(entry) => Ok(Some(Entry {
            id: entry.id(),
            mode: entry.filemode(),
            kind: entry.kind(),
        })),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn change_between(previous: Option<Entry>, current: Option<Entry>) -> PathChange {
    match (previous, current) {
        (None, Some(_)) => PathChange::Added,
        (Some(_), None) => PathChange::Deleted,
        _ => PathChange::Modified,
    }
}

fn page_offset(index: usize, limit: usize) -> usize {
    index
        .checked_div(limit)
        .map_or(0, |page| page.saturating_mul(limit))
}

/// Scope identity: the cursor is valid only for the path and start it was issued for.
fn scope_id(path: &str, start: Oid) -> Result<String, AppError> {
    let encoded = serde_json::to_vec(&("file-history", path, start.to_string()))
        .map_err(|error| AppError::Internal(format!("could not encode history scope: {error}")))?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

/// Parsed form of `scope:last:frontier`.
struct Cursor {
    scope: String,
    last: Oid,
    frontier: BTreeSet<Oid>,
}

fn encode_cursor(
    scope: &str,
    last: Option<Oid>,
    followed: &BTreeSet<Oid>,
) -> Result<String, AppError> {
    let last = last.ok_or_else(|| {
        AppError::Internal("file history stopped before examining any commit".into())
    })?;
    let frontier = followed
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",");
    Ok(format!("{scope}:{last}:{frontier}"))
}

fn parse_cursor(value: &str) -> Result<Cursor, AppError> {
    let invalid = || AppError::InvalidInput("Invalid file history cursor".into());
    let mut parts = value.splitn(3, ':');
    let (Some(scope), Some(last), Some(frontier)) = (parts.next(), parts.next(), parts.next())
    else {
        return Err(invalid());
    };
    if scope.len() != 64 || !scope.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid());
    }
    let frontier = frontier
        .split(',')
        .filter(|id| !id.is_empty())
        .map(parse_commit_id)
        .collect::<Result<BTreeSet<_>, _>>()?;
    if u32::try_from(frontier.len()).unwrap_or(u32::MAX) > MAX_FRONTIER {
        return Err(invalid());
    }
    Ok(Cursor {
        scope: scope.to_ascii_lowercase(),
        last: parse_commit_id(last)?,
        frontier,
    })
}

#[cfg(test)]
#[allow(clippy::many_single_char_names)]
mod tests {
    use git2::{Commit, IndexEntry, IndexTime, Signature};
    use tempfile::TempDir;

    use super::*;
    use crate::history::HistoryReader;

    const FILE: u32 = 0o100_644;
    const EXECUTABLE: u32 = 0o100_755;

    /// A file in a commit's snapshot: path, content and mode.
    type Snapshot<'a> = &'a [(&'a str, &'a [u8], u32)];

    struct Fixture {
        _dir: TempDir,
        repo: Repository,
        active: ActiveRepo,
    }

    impl Fixture {
        fn new() -> Self {
            let dir = tempfile::tempdir().unwrap();
            let repo = Repository::init(dir.path()).unwrap();
            let active = ActiveRepo::validate(dir.path()).unwrap();
            Self {
                _dir: dir,
                repo,
                active,
            }
        }

        /// Creates a commit whose tree is exactly `files`, without moving any ref.
        fn commit(&self, parents: &[Oid], files: Snapshot<'_>) -> Oid {
            let mut index = git2::Index::new().unwrap();
            for (path, content, mode) in files {
                let entry = IndexEntry {
                    ctime: IndexTime::new(0, 0),
                    mtime: IndexTime::new(0, 0),
                    dev: 0,
                    ino: 0,
                    mode: *mode,
                    uid: 0,
                    gid: 0,
                    file_size: 0,
                    id: self.repo.blob(content).unwrap(),
                    flags: 0,
                    flags_extended: 0,
                    path: path.as_bytes().to_vec(),
                };
                index.add(&entry).unwrap();
            }
            let tree = self
                .repo
                .find_tree(index.write_tree_to(&self.repo).unwrap())
                .unwrap();
            let parents: Vec<Commit<'_>> = parents
                .iter()
                .map(|id| self.repo.find_commit(*id).unwrap())
                .collect();
            let parent_refs: Vec<&Commit<'_>> = parents.iter().collect();
            let signature = Signature::now("Tester", "tester@example.com").unwrap();
            self.repo
                .commit(None, &signature, &signature, "change", &tree, &parent_refs)
                .unwrap()
        }

        fn request(path: &str, start: Oid, limit: u16) -> FileHistoryRequest {
            FileHistoryRequest {
                path: path.into(),
                start: start.to_string(),
                limit,
                cursor: None,
                focus_commit: None,
            }
        }

        /// Follows every cursor to the end and returns the listed commit ids.
        fn all_ids(
            &self,
            reader: Option<&HistoryReader>,
            path: &str,
            start: Oid,
            limit: u16,
        ) -> Vec<String> {
            let mut request = Self::request(path, start, limit);
            let mut ids = Vec::new();
            loop {
                let page = get_file_history(&self.active, reader, &request).unwrap();
                assert!(page.truncation.is_none(), "unexpected truncation: {page:?}");
                ids.extend(page.rows.iter().map(|row| row.commit.id.clone()));
                match page.next_cursor {
                    Some(cursor) => request.cursor = Some(cursor),
                    None => return ids,
                }
            }
        }
    }

    fn rows(page: &FileHistoryPage) -> Vec<(Oid, PathChange, bool)> {
        page.rows
            .iter()
            .map(|row| {
                (
                    Oid::from_str(&row.commit.id).unwrap(),
                    row.change,
                    row.is_merge,
                )
            })
            .collect()
    }

    #[test]
    fn lists_only_commits_that_changed_the_path_newest_first() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE), ("g", b"x", FILE)]);
        let b = fixture.commit(&[a], &[("f", b"1", FILE), ("g", b"y", FILE)]);
        let c = fixture.commit(&[b], &[("f", b"2", FILE), ("g", b"y", FILE)]);
        let d = fixture.commit(&[c], &[("f", b"2", FILE), ("g", b"z", FILE)]);
        let e = fixture.commit(&[d], &[("f", b"3", FILE), ("g", b"z", FILE)]);
        let page = get_file_history(&fixture.active, None, &Fixture::request("f", e, 200)).unwrap();
        assert_eq!(
            rows(&page),
            vec![
                (e, PathChange::Modified, false),
                (c, PathChange::Modified, false),
                (a, PathChange::Added, false),
            ]
        );
        assert!(page.next_cursor.is_none() && page.truncation.is_none());
    }

    #[test]
    fn every_page_size_yields_the_same_sequence() {
        let fixture = Fixture::new();
        let mut parent = Vec::new();
        let mut expected = Vec::new();
        let mut head = Oid::ZERO_SHA1;
        for step in 0..30u8 {
            let content = [step / 3];
            let id = fixture.commit(&parent, &[("f", &content, FILE)]);
            if step % 3 == 0 {
                expected.push(id.to_string());
            }
            parent = vec![id];
            head = id;
        }
        expected.reverse();
        for limit in [1u16, 2, 7, 200] {
            assert_eq!(
                fixture.all_ids(None, "f", head, limit),
                expected,
                "limit {limit}"
            );
        }
    }

    #[test]
    fn cached_and_uncached_walks_agree() {
        let fixture = Fixture::new();
        let mut parent = Vec::new();
        let mut head = Oid::ZERO_SHA1;
        for step in 0..12u8 {
            let content = [step % 4];
            let id = fixture.commit(&parent, &[("f", &content, FILE)]);
            parent = vec![id];
            head = id;
        }
        let reader = HistoryReader::with_budget(1_000);
        assert_eq!(
            fixture.all_ids(Some(&reader), "f", head, 5),
            fixture.all_ids(None, "f", head, 5)
        );
    }

    #[test]
    fn skips_treesame_commits_and_reports_deletion_and_recreation() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE)]);
        let b = fixture.commit(&[a], &[]);
        let c = fixture.commit(&[b], &[("f", b"1", FILE)]);
        let page = get_file_history(&fixture.active, None, &Fixture::request("f", c, 200)).unwrap();
        assert_eq!(
            rows(&page),
            vec![
                (c, PathChange::Added, false),
                (b, PathChange::Deleted, false),
                (a, PathChange::Added, false),
            ]
        );
    }

    #[test]
    fn a_path_already_deleted_at_the_start_lists_its_deletion() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE), ("g", b"1", FILE)]);
        let b = fixture.commit(&[a], &[("g", b"1", FILE)]);
        let page = get_file_history(&fixture.active, None, &Fixture::request("f", b, 200)).unwrap();
        assert_eq!(
            rows(&page),
            vec![
                (b, PathChange::Deleted, false),
                (a, PathChange::Added, false)
            ]
        );
    }

    #[test]
    fn mode_change_counts_as_a_modification() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE)]);
        let b = fixture.commit(&[a], &[("f", b"1", EXECUTABLE)]);
        let page = get_file_history(&fixture.active, None, &Fixture::request("f", b, 200)).unwrap();
        assert_eq!(
            rows(&page),
            vec![
                (b, PathChange::Modified, false),
                (a, PathChange::Added, false)
            ]
        );
    }

    #[test]
    fn merge_identical_to_its_first_parent_is_hidden_and_only_that_parent_is_followed() {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], &[("f", b"1", FILE)]);
        let first = fixture.commit(&[root], &[("f", b"1", FILE), ("h", b"a", FILE)]);
        let side = fixture.commit(&[root], &[("f", b"2", FILE)]);
        let merge = fixture.commit(&[first, side], &[("f", b"1", FILE), ("h", b"a", FILE)]);
        let page =
            get_file_history(&fixture.active, None, &Fixture::request("f", merge, 200)).unwrap();
        assert_eq!(rows(&page), vec![(root, PathChange::Added, false)]);
    }

    #[test]
    fn merge_resolving_a_conflict_is_listed_and_follows_every_parent() {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], &[("f", b"1", FILE)]);
        let first = fixture.commit(&[root], &[("f", b"2", FILE)]);
        let side = fixture.commit(&[root], &[("f", b"3", FILE)]);
        let merge = fixture.commit(&[first, side], &[("f", b"4", FILE)]);
        let page =
            get_file_history(&fixture.active, None, &Fixture::request("f", merge, 200)).unwrap();
        // Parents sharing a timestamp are ordered by libgit2's tie-break, so the
        // siblings are compared as a set; the merge and the root are fixed by topology.
        let listed = rows(&page);
        assert_eq!(listed.first(), Some(&(merge, PathChange::Modified, true)));
        assert_eq!(listed.last(), Some(&(root, PathChange::Added, false)));
        let mut middle = listed[1..3].to_vec();
        middle.sort_by_key(|row| row.0.to_string());
        let mut expected = vec![
            (first, PathChange::Modified, false),
            (side, PathChange::Modified, false),
        ];
        expected.sort_by_key(|row| row.0.to_string());
        assert_eq!(middle, expected);
    }

    #[test]
    fn side_branch_kept_by_the_merge_is_listed_and_the_merge_hidden() {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], &[("f", b"1", FILE)]);
        let first = fixture.commit(&[root], &[("f", b"1", FILE), ("h", b"a", FILE)]);
        let side = fixture.commit(&[root], &[("f", b"2", FILE)]);
        let merge = fixture.commit(&[first, side], &[("f", b"2", FILE), ("h", b"a", FILE)]);
        let page =
            get_file_history(&fixture.active, None, &Fixture::request("f", merge, 200)).unwrap();
        assert_eq!(
            rows(&page),
            vec![
                (side, PathChange::Modified, false),
                (root, PathChange::Added, false)
            ]
        );
    }

    #[test]
    fn side_branch_reverted_inside_the_merge_is_pruned() {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], &[("f", b"1", FILE)]);
        let first = fixture.commit(&[root], &[("f", b"1", FILE), ("h", b"a", FILE)]);
        let changed = fixture.commit(&[root], &[("f", b"2", FILE)]);
        let reverted = fixture.commit(&[changed], &[("f", b"1", FILE)]);
        let merge = fixture.commit(&[first, reverted], &[("f", b"1", FILE), ("h", b"a", FILE)]);
        let page =
            get_file_history(&fixture.active, None, &Fixture::request("f", merge, 200)).unwrap();
        assert_eq!(rows(&page), vec![(root, PathChange::Added, false)]);
    }

    #[test]
    fn octopus_merge_differing_from_all_parents_follows_each_of_them() {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], &[("f", b"1", FILE)]);
        let a = fixture.commit(&[root], &[("f", b"a", FILE)]);
        let b = fixture.commit(&[root], &[("f", b"b", FILE)]);
        let c = fixture.commit(&[root], &[("f", b"c", FILE)]);
        let octopus = fixture.commit(&[a, b, c], &[("f", b"d", FILE)]);
        let page =
            get_file_history(&fixture.active, None, &Fixture::request("f", octopus, 200)).unwrap();
        let listed: Vec<Oid> = rows(&page).into_iter().map(|row| row.0).collect();
        assert_eq!(page.rows.len(), 5);
        assert_eq!(listed[0], octopus);
        assert!(page.rows[0].is_merge);
        for parent in [a, b, c] {
            assert!(listed.contains(&parent));
        }
        assert!(listed.contains(&root));
    }

    #[test]
    fn a_path_that_is_a_directory_or_missing_is_rejected() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("d/f", b"1", FILE)]);
        let as_directory = get_file_history(&fixture.active, None, &Fixture::request("d", a, 10));
        assert!(matches!(as_directory, Err(AppError::InvalidInput(_))));
        let missing = get_file_history(&fixture.active, None, &Fixture::request("nope", a, 10));
        assert!(matches!(missing, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn invalid_paths_limits_and_unknown_starts_fail_with_typed_errors() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE)]);
        for path in ["", "/f", "../f", "f/", "./f", "a/../f"] {
            let result = get_file_history(&fixture.active, None, &Fixture::request(path, a, 10));
            assert!(matches!(result, Err(AppError::InvalidInput(_))), "{path:?}");
        }
        let long = "a".repeat(MAX_PATH_BYTES + 1);
        assert!(matches!(
            get_file_history(&fixture.active, None, &Fixture::request(&long, a, 10)),
            Err(AppError::InvalidInput(_))
        ));
        for limit in [0u16, 201] {
            assert!(matches!(
                get_file_history(&fixture.active, None, &Fixture::request("f", a, limit)),
                Err(AppError::InvalidInput(_))
            ));
        }
        let mut unknown = Fixture::request("f", a, 10);
        unknown.start = "1".repeat(40);
        assert!(matches!(
            get_file_history(&fixture.active, None, &unknown),
            Err(AppError::StaleCursor(_) | AppError::Git(_))
        ));
    }

    #[test]
    fn work_limit_pages_resume_without_losing_or_repeating_rows() {
        let fixture = Fixture::new();
        let mut parent = Vec::new();
        let mut head = Oid::ZERO_SHA1;
        for step in 0..9u8 {
            let id = fixture.commit(&parent, &[("f", &[step % 2], FILE), ("g", &[step], FILE)]);
            parent = vec![id];
            head = id;
        }
        let expected = fixture.all_ids(None, "f", head, 200);
        let budget = Budget {
            examined: 2,
            frontier: MAX_FRONTIER,
        };
        let mut request = Fixture::request("f", head, 200);
        let mut collected = Vec::new();
        loop {
            let page = file_history(&fixture.active, None, &request, budget).unwrap();
            collected.extend(page.rows.iter().map(|row| row.commit.id.clone()));
            match page.next_cursor {
                Some(cursor) => {
                    assert_eq!(page.truncation, Some(Truncation::WorkLimit));
                    request.cursor = Some(cursor);
                }
                None => break,
            }
        }
        assert_eq!(collected, expected);
    }

    #[test]
    fn an_octopus_exceeding_the_frontier_bound_ends_without_a_cursor() {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], &[("f", b"1", FILE)]);
        let a = fixture.commit(&[root], &[("f", b"a", FILE)]);
        let b = fixture.commit(&[root], &[("f", b"b", FILE)]);
        let c = fixture.commit(&[root], &[("f", b"c", FILE)]);
        let octopus = fixture.commit(&[a, b, c], &[("f", b"d", FILE)]);
        let budget = Budget {
            examined: MAX_EXAMINED_PER_REQUEST,
            frontier: 1,
        };
        let page = file_history(
            &fixture.active,
            None,
            &Fixture::request("f", octopus, 200),
            budget,
        )
        .unwrap();
        assert_eq!(page.truncation, Some(Truncation::FrontierLimit));
        assert!(page.next_cursor.is_none());
    }

    #[test]
    fn a_cursor_from_another_path_or_start_is_stale() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE), ("g", b"1", FILE)]);
        let b = fixture.commit(&[a], &[("f", b"2", FILE), ("g", b"2", FILE)]);
        let c = fixture.commit(&[b], &[("f", b"3", FILE), ("g", b"3", FILE)]);
        let mut first = Fixture::request("f", c, 1);
        let page = get_file_history(&fixture.active, None, &first).unwrap();
        first.cursor = page.next_cursor;
        let mut other_path = Fixture::request("g", c, 1);
        other_path.cursor = first.cursor.clone();
        assert!(matches!(
            get_file_history(&fixture.active, None, &other_path),
            Err(AppError::StaleCursor(_))
        ));
        let mut tampered = Fixture::request("f", c, 1);
        tampered.cursor = first.cursor.map(|cursor| {
            let (scope, _) = cursor.split_once(':').unwrap();
            format!("{scope}:{}:", "e".repeat(40))
        });
        assert!(matches!(
            get_file_history(&fixture.active, None, &tampered),
            Err(AppError::InvalidInput(_) | AppError::StaleCursor(_))
        ));
    }

    #[test]
    fn focus_commit_returns_the_page_containing_it() {
        let fixture = Fixture::new();
        let mut parent = Vec::new();
        let mut ids = Vec::new();
        for step in 0..10u8 {
            let id = fixture.commit(&parent, &[("f", &[step], FILE)]);
            ids.push(id);
            parent = vec![id];
        }
        let head = ids[9];
        let focus = ids[3];
        let mut request = Fixture::request("f", head, 3);
        request.focus_commit = Some(focus.to_string());
        let page = get_file_history(&fixture.active, None, &request).unwrap();
        assert_eq!(page.focus, Some(FocusOutcome::Found));
        let listed: Vec<String> = page.rows.iter().map(|row| row.commit.id.clone()).collect();
        assert!(listed.contains(&focus.to_string()));
        assert_eq!(listed.len(), 3);
    }

    #[test]
    fn focus_on_a_commit_outside_the_path_history_is_not_shown() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE), ("g", b"1", FILE)]);
        let b = fixture.commit(&[a], &[("f", b"1", FILE), ("g", b"2", FILE)]);
        let mut request = Fixture::request("f", b, 10);
        request.focus_commit = Some(b.to_string());
        let page = get_file_history(&fixture.active, None, &request).unwrap();
        assert_eq!(page.focus, Some(FocusOutcome::NotShown));
        assert_eq!(rows(&page), vec![(a, PathChange::Added, false)]);
    }

    #[test]
    fn focus_beyond_the_budget_reports_it_and_lists_from_the_top() {
        let fixture = Fixture::new();
        let mut parent = Vec::new();
        let mut ids = Vec::new();
        for step in 0..6u8 {
            let id = fixture.commit(&parent, &[("f", &[step], FILE)]);
            ids.push(id);
            parent = vec![id];
        }
        let budget = Budget {
            examined: 2,
            frontier: MAX_FRONTIER,
        };
        let mut request = Fixture::request("f", ids[5], 2);
        request.focus_commit = Some(ids[0].to_string());
        let page = file_history(&fixture.active, None, &request, budget).unwrap();
        assert_eq!(page.focus, Some(FocusOutcome::OutsideBudget));
        assert_eq!(page.rows[0].commit.id, ids[5].to_string());
    }

    /// Informative timing of the performance decision (ADR 0008, decision 12).
    /// Run with `cargo test -p gitcanvas-core --release -- --ignored --nocapture`.
    #[test]
    #[ignore = "benchmark: measured, not a gate"]
    #[allow(clippy::print_stderr)]
    fn ten_thousand_commit_fixture_meets_the_documented_budgets() {
        let fixture = Fixture::new();
        let mut parent = Vec::new();
        let mut head = Oid::ZERO_SHA1;
        for step in 0..10_000u32 {
            let content = (step / 50).to_le_bytes();
            let filler = step.to_le_bytes();
            let id = fixture.commit(&parent, &[("f", &content, FILE), ("g", &filler, FILE)]);
            parent = vec![id];
            head = id;
        }
        let reader = HistoryReader::with_budget(FILE_HISTORY_CACHED_COMMITS);
        let request = Fixture::request("f", head, 50);
        let started = std::time::Instant::now();
        let first = get_file_history(&fixture.active, Some(&reader), &request).unwrap();
        let cold = started.elapsed();
        let started = std::time::Instant::now();
        let cached = get_file_history(&fixture.active, Some(&reader), &request).unwrap();
        let warm = started.elapsed();
        assert_eq!(first.rows.len(), 50);
        assert_eq!(cached.rows.len(), 50);
        eprintln!("file history 10k: first page {cold:?}, cached page {warm:?}");
    }
}
