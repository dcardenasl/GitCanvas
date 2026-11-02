//! Per-file history: the commits that changed one path, simplified the way
//! `git log -- <path>` simplifies by default, and followed through renames the
//! way `git log --follow` does: a rename continues the lineage under the old name.
//!
//! A request examines a bounded number of commits and ends with a stateless
//! cursor: the last commit examined, the followed commits not yet reached with
//! the name each one is tracked under, and the renames followed so far. Nothing
//! is kept on the server between pages, so cache eviction can never change a
//! result. See ADR 0008.

use std::{
    collections::{BTreeMap, HashMap},
    path::{Component, Path},
};

use git2::{Delta, ErrorCode, ObjectType, Oid, Repository};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use crate::{
    diff::find_renames,
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
/// Renames followed in one query. Past this the lineage ends at the next rename.
pub const MAX_RENAMES_PER_QUERY: u32 = 32;
/// Changed files in a commit above which rename detection is skipped for it.
pub const MAX_RENAME_SEARCH_DELTAS: u32 = 2_000;
/// Largest cursor the engine issues. A frontier that would not fit ends the query.
const MAX_CURSOR_BYTES: usize = 1024 * 1024;
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
    /// Repository-relative path of a file at the start commit, exactly as Git stores it.
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
    /// The path's name at this commit.
    pub path_at_commit: String,
    /// The previous name, when this commit renamed the path into `path_at_commit`.
    pub renamed_from: Option<String>,
    /// Set when the lineage could not be followed past this commit:
    /// `RenameLimit` or `RenameSearchSkipped`.
    pub lineage: Option<Truncation>,
}

/// Why history stopped short. Page-level values end a page; row-level values
/// mark a commit where a rename could not be followed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Truncation {
    /// The request examined its commit budget; the cursor resumes the search.
    WorkLimit,
    /// Too many followed commits are pending; the search cannot be resumed.
    FrontierLimit,
    /// The rename budget was spent; the lineage ends at this commit.
    RenameLimit,
    /// The commit changes too many files to search for renames; the lineage may be incomplete.
    RenameSearchSkipped,
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
    /// Renames followed per query.
    pub max_renames: u32,
    /// Changed files per commit above which rename detection is skipped.
    pub max_rename_search_deltas: u32,
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
    let top = Position::top(start, &request.path);
    let run = |position: Position, query: Query| {
        with_walk(active, &repo, &[start], reader, |walk| {
            pass(&repo, walk, position, &query, budget)
        })
    };
    let (position, skip, focus_outcome) = match (focus, cursor) {
        (Some(target), None) => {
            let (skip, outcome) = focus_offset(&run, top.clone(), target, limit)?;
            (top, skip, Some(outcome))
        }
        (_, Some(cursor)) => (
            Position {
                last: Some(cursor.last),
                followed: cursor.frontier,
                renames: cursor.renames,
            },
            0,
            None,
        ),
        (None, None) => (top, 0, None),
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
            max_renames: MAX_RENAMES_PER_QUERY,
            max_rename_search_deltas: MAX_RENAME_SEARCH_DELTAS,
        },
    })
}

/// Finds `target` from the top of the history. Returns how many rows precede
/// the page that contains it, and whether it was found at all.
fn focus_offset(
    run: &impl Fn(Position, Query) -> Result<Pass, AppError>,
    top: Position,
    target: Oid,
    limit: usize,
) -> Result<(usize, FocusOutcome), AppError> {
    let probe = run(
        top,
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
    let resumable = |truncation: Option<Truncation>| match encode_cursor(
        scope,
        page.last,
        &page.followed,
        page.renames,
    )? {
        Some(cursor) => Ok((Some(cursor), truncation)),
        None => Ok((None, Some(Truncation::FrontierLimit))),
    };
    match page.stop {
        Stop::Exhausted | Stop::Focus(_) => Ok((None, None)),
        Stop::Full => resumable(None),
        Stop::WorkLimit => resumable(Some(Truncation::WorkLimit)),
        Stop::FrontierLimit => Ok((None, Some(Truncation::FrontierLimit))),
    }
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

/// Where a pass resumes: the last commit already examined, the followed commits
/// still waiting to be reached (each with the name its path has there), and the
/// renames followed so far.
#[derive(Debug, Clone)]
struct Position {
    last: Option<Oid>,
    followed: BTreeMap<Oid, String>,
    renames: u32,
}

impl Position {
    /// The beginning of the walk: only the start commit is followed, under `path`.
    fn top(start: Oid, path: &str) -> Self {
        Self {
            last: None,
            followed: BTreeMap::from([(start, path.to_owned())]),
            renames: 0,
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
    followed: BTreeMap<Oid, String>,
    renames: u32,
}

/// Walks the commits in order from `position`, applying the simplification rule
/// to each followed commit. Each commit is examined at most once per request.
fn pass(
    repo: &Repository,
    walk: &mut dyn Iterator<Item = Result<Oid, git2::Error>>,
    position: Position,
    query: &Query,
    budget: Budget,
) -> Result<Pass, AppError> {
    let Position {
        last: resume_after,
        mut followed,
        mut renames,
    } = position;
    let mut entries = Entries {
        repo,
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
        let Some(tracked) = followed.get(&id).cloned() else {
            last = Some(id);
            continue;
        };
        let (commit, verdict) = judge(repo, &mut entries, id, &tracked, renames)?;
        if let Some(emission) = verdict.emission {
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
                        change: emission.change,
                        is_merge: verdict.is_merge,
                        path_at_commit: tracked,
                        renamed_from: emission.renamed_from,
                        lineage: emission.lineage,
                    });
                }
            }
            emitted = emitted.saturating_add(1);
        }
        followed.remove(&id);
        for (parent, path) in verdict.follow {
            followed.entry(parent).or_insert(path);
        }
        if verdict.renamed {
            renames = renames.saturating_add(1);
        }
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
        renames,
    })
}

/// What a commit contributes to the history, when it contributes anything.
struct Emission {
    change: PathChange,
    renamed_from: Option<String>,
    lineage: Option<Truncation>,
}

impl Emission {
    fn plain(change: PathChange) -> Self {
        Self {
            change,
            renamed_from: None,
            lineage: None,
        }
    }
}

/// The simplification decision for one followed commit.
struct Verdict {
    /// The row to emit, or `None` when the commit is TREESAME to a parent.
    emission: Option<Emission>,
    is_merge: bool,
    /// Parents this commit makes followed, each with the name its path has there.
    follow: Vec<(Oid, String)>,
    /// Whether this decision followed a rename.
    renamed: bool,
}

/// Compares the path entry with each parent, as `git log -- <path>` does: a
/// commit identical to some parent is hidden and only that parent is followed;
/// otherwise it is emitted and every parent is followed. A path that appears in
/// a single-parent commit is first searched for a rename, unless the commit is a merge.
fn judge<'repo>(
    repo: &'repo Repository,
    entries: &mut Entries<'_>,
    id: Oid,
    tracked: &str,
    renames: u32,
) -> Result<(git2::Commit<'repo>, Verdict), AppError> {
    let commit = repo.find_commit(id)?;
    let entry = entries.entry_of(id, tracked)?;
    let parents: Vec<Oid> = commit.parent_ids().collect();
    let is_merge = parents.len() > 1;
    let Some(&first) = parents.first() else {
        let emission = entry.map(|_| Emission::plain(PathChange::Added));
        return Ok((
            commit,
            Verdict {
                emission,
                is_merge,
                follow: Vec::new(),
                renamed: false,
            },
        ));
    };
    let first_entry = entries.entry_of(first, tracked)?;
    if !is_merge && first_entry.is_none() && entry.is_some() {
        let verdict = added_by_single_parent(repo, &commit, first, tracked, renames)?;
        return Ok((commit, verdict));
    }
    let mut same_as = (first_entry == entry).then_some(first);
    if same_as.is_none() {
        for parent in parents.iter().skip(1) {
            if entries.entry_of(*parent, tracked)? == entry {
                same_as = Some(*parent);
                break;
            }
        }
    }
    let verdict = match same_as {
        Some(parent) => Verdict {
            emission: None,
            is_merge,
            follow: vec![(parent, tracked.to_owned())],
            renamed: false,
        },
        None => Verdict {
            emission: Some(Emission::plain(change_between(first_entry, entry))),
            is_merge,
            follow: parents
                .iter()
                .map(|parent| (*parent, tracked.to_owned()))
                .collect(),
            renamed: false,
        },
    };
    Ok((commit, verdict))
}

/// Decides a commit that adds the tracked path to a single-parent history: the
/// add is either the destination of a rename, which the lineage follows under
/// the source name, or a plain add that ends the lineage or continues the same name.
fn added_by_single_parent(
    repo: &Repository,
    commit: &git2::Commit<'_>,
    parent: Oid,
    tracked: &str,
    renames: u32,
) -> Result<Verdict, AppError> {
    let added = |renamed_from, lineage, follow| Verdict {
        emission: Some(Emission {
            change: PathChange::Added,
            renamed_from,
            lineage,
        }),
        is_merge: false,
        follow,
        renamed: false,
    };
    Ok(match find_rename(repo, commit, parent, tracked)? {
        RenameSearch::Found(source) if renames < MAX_RENAMES_PER_QUERY => Verdict {
            renamed: true,
            ..added(Some(source.clone()), None, vec![(parent, source)])
        },
        RenameSearch::Found(_) => added(None, Some(Truncation::RenameLimit), Vec::new()),
        RenameSearch::Skipped => added(
            None,
            Some(Truncation::RenameSearchSkipped),
            vec![(parent, tracked.to_owned())],
        ),
        RenameSearch::Absent => added(None, None, vec![(parent, tracked.to_owned())]),
    })
}

/// Outcome of looking for the previous name of a path added in one commit.
enum RenameSearch {
    /// The path is the destination of a rename from this source path.
    Found(String),
    /// No rename with the path as destination.
    Absent,
    /// The commit changes too many files to search.
    Skipped,
}

/// Runs the commit's first-parent diff through rename detection and looks for
/// the path as the destination of a rename.
fn find_rename(
    repo: &Repository,
    commit: &git2::Commit<'_>,
    parent: Oid,
    tracked: &str,
) -> Result<RenameSearch, AppError> {
    let parent_tree = repo.find_commit(parent)?.tree()?;
    let mut diff = repo.diff_tree_to_tree(Some(&parent_tree), Some(&commit.tree()?), None)?;
    if u32::try_from(diff.deltas().len()).unwrap_or(u32::MAX) > MAX_RENAME_SEARCH_DELTAS {
        return Ok(RenameSearch::Skipped);
    }
    find_renames(&mut diff)?;
    for delta in diff.deltas() {
        if delta.status() != Delta::Renamed || delta.new_file().path() != Some(Path::new(tracked)) {
            continue;
        }
        if let Some(source) = delta.old_file().path().and_then(Path::to_str) {
            return Ok(RenameSearch::Found(source.to_owned()));
        }
    }
    Ok(RenameSearch::Absent)
}

/// A tree entry's identity: its object, its mode, and what kind of object it is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Entry {
    id: Oid,
    mode: i32,
    kind: Option<ObjectType>,
}

/// Path entries of the commits one pass has already read, keyed by commit and
/// name. A commit is read once as a parent and again when it is judged; the memo
/// makes the second read free.
struct Entries<'a> {
    repo: &'a Repository,
    memo: HashMap<(Oid, String), Option<Entry>>,
}

impl Entries<'_> {
    fn entry_of(&mut self, id: Oid, path: &str) -> Result<Option<Entry>, AppError> {
        let key = (id, path.to_owned());
        if let Some(entry) = self.memo.get(&key) {
            return Ok(*entry);
        }
        let entry = path_entry(&self.repo.find_commit(id)?, path)?;
        self.memo.insert(key, entry);
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

/// Parsed form of `scope:last:renames:frontier`.
struct Cursor {
    scope: String,
    last: Oid,
    renames: u32,
    frontier: BTreeMap<Oid, String>,
}

/// Encodes the resume state. Each frontier name is hex-encoded so no name can
/// collide with the separators. Returns `None` when the cursor would exceed
/// [`MAX_CURSOR_BYTES`].
fn encode_cursor(
    scope: &str,
    last: Option<Oid>,
    followed: &BTreeMap<Oid, String>,
    renames: u32,
) -> Result<Option<String>, AppError> {
    let last = last.ok_or_else(|| {
        AppError::Internal("file history stopped before examining any commit".into())
    })?;
    let frontier = followed
        .iter()
        .map(|(id, path)| format!("{id}={}", hex_encode(path)))
        .collect::<Vec<_>>()
        .join(",");
    let cursor = format!("{scope}:{last}:{renames}:{frontier}");
    Ok((cursor.len() <= MAX_CURSOR_BYTES).then_some(cursor))
}

fn parse_cursor(value: &str) -> Result<Cursor, AppError> {
    let invalid = || AppError::InvalidInput("Invalid file history cursor".into());
    if value.len() > MAX_CURSOR_BYTES {
        return Err(invalid());
    }
    let mut parts = value.splitn(4, ':');
    let (Some(scope), Some(last), Some(renames), Some(frontier)) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(invalid());
    };
    if scope.len() != 64 || !scope.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(invalid());
    }
    let renames = renames.parse::<u32>().map_err(|_| invalid())?;
    if renames > MAX_RENAMES_PER_QUERY {
        return Err(invalid());
    }
    let mut followed = BTreeMap::new();
    for item in frontier.split(',').filter(|item| !item.is_empty()) {
        let Some((id, encoded)) = item.split_once('=') else {
            return Err(invalid());
        };
        let path = hex_decode(encoded).ok_or_else(invalid)?;
        if path.len() > MAX_PATH_BYTES {
            return Err(invalid());
        }
        if followed.insert(parse_commit_id(id)?, path).is_some() {
            return Err(invalid());
        }
    }
    if u32::try_from(followed.len()).unwrap_or(u32::MAX) > MAX_FRONTIER {
        return Err(invalid());
    }
    Ok(Cursor {
        scope: scope.to_ascii_lowercase(),
        last: parse_commit_id(last)?,
        renames,
        frontier: followed,
    })
}

fn hex_encode(value: &str) -> String {
    use std::fmt::Write as _;
    value.bytes().fold(
        String::with_capacity(value.len().saturating_mul(2)),
        |mut hex, byte| {
            // Writing into a String cannot fail.
            let _ = write!(hex, "{byte:02x}");
            hex
        },
    )
}

/// Inverse of [`hex_encode`]. `None` for anything that is not valid hexadecimal UTF-8.
fn hex_decode(value: &str) -> Option<String> {
    if !value.len().is_multiple_of(2) {
        return None;
    }
    let bytes = value
        .as_bytes()
        .chunks(2)
        .map(|pair| {
            std::str::from_utf8(pair)
                .ok()
                .and_then(|digits| u8::from_str_radix(digits, 16).ok())
        })
        .collect::<Option<Vec<u8>>>()?;
    String::from_utf8(bytes).ok()
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

        /// Follows every cursor to the end and returns the listed rows.
        fn all_rows(
            &self,
            reader: Option<&HistoryReader>,
            path: &str,
            start: Oid,
            limit: u16,
        ) -> Vec<FileHistoryRow> {
            let mut request = request(path, start, limit);
            let mut rows = Vec::new();
            loop {
                let page = get_file_history(&self.active, reader, &request).unwrap();
                assert!(page.truncation.is_none(), "unexpected truncation: {page:?}");
                rows.extend(page.rows);
                match page.next_cursor {
                    Some(cursor) => request.cursor = Some(cursor),
                    None => return rows,
                }
            }
        }

        fn all_ids(
            &self,
            reader: Option<&HistoryReader>,
            path: &str,
            start: Oid,
            limit: u16,
        ) -> Vec<String> {
            self.all_rows(reader, path, start, limit)
                .into_iter()
                .map(|row| row.commit.id)
                .collect()
        }
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

    fn page(fixture: &Fixture, path: &str, start: Oid) -> FileHistoryPage {
        get_file_history(&fixture.active, None, &request(path, start, 200)).unwrap()
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
        let page = page(&fixture, "f", e);
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
        let page = page(&fixture, "f", c);
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
        let page = page(&fixture, "f", b);
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
        let page = page(&fixture, "f", b);
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
        let page = page(&fixture, "f", merge);
        assert_eq!(rows(&page), vec![(root, PathChange::Added, false)]);
    }

    #[test]
    fn merge_resolving_a_conflict_is_listed_and_follows_every_parent() {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], &[("f", b"1", FILE)]);
        let first = fixture.commit(&[root], &[("f", b"2", FILE)]);
        let side = fixture.commit(&[root], &[("f", b"3", FILE)]);
        let merge = fixture.commit(&[first, side], &[("f", b"4", FILE)]);
        let page = page(&fixture, "f", merge);
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
        let page = page(&fixture, "f", merge);
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
        let page = page(&fixture, "f", merge);
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
        let page = page(&fixture, "f", octopus);
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
        let as_directory = get_file_history(&fixture.active, None, &request("d", a, 10));
        assert!(matches!(as_directory, Err(AppError::InvalidInput(_))));
        let missing = get_file_history(&fixture.active, None, &request("nope", a, 10));
        assert!(matches!(missing, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn invalid_paths_limits_and_unknown_starts_fail_with_typed_errors() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE)]);
        for path in ["", "/f", "../f", "f/", "./f", "a/../f"] {
            let result = get_file_history(&fixture.active, None, &request(path, a, 10));
            assert!(matches!(result, Err(AppError::InvalidInput(_))), "{path:?}");
        }
        let long = "a".repeat(MAX_PATH_BYTES + 1);
        assert!(matches!(
            get_file_history(&fixture.active, None, &request(&long, a, 10)),
            Err(AppError::InvalidInput(_))
        ));
        for limit in [0u16, 201] {
            assert!(matches!(
                get_file_history(&fixture.active, None, &request("f", a, limit)),
                Err(AppError::InvalidInput(_))
            ));
        }
        let mut unknown = request("f", a, 10);
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
        let mut request = request("f", head, 200);
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
        let page =
            file_history(&fixture.active, None, &request("f", octopus, 200), budget).unwrap();
        assert_eq!(page.truncation, Some(Truncation::FrontierLimit));
        assert!(page.next_cursor.is_none());
    }

    #[test]
    fn a_cursor_from_another_path_or_start_is_stale() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("f", b"1", FILE), ("g", b"1", FILE)]);
        let b = fixture.commit(&[a], &[("f", b"2", FILE), ("g", b"2", FILE)]);
        let c = fixture.commit(&[b], &[("f", b"3", FILE), ("g", b"3", FILE)]);
        let mut first = request("f", c, 1);
        let page = get_file_history(&fixture.active, None, &first).unwrap();
        first.cursor = page.next_cursor;
        let mut other_path = request("g", c, 1);
        other_path.cursor = first.cursor.clone();
        assert!(matches!(
            get_file_history(&fixture.active, None, &other_path),
            Err(AppError::StaleCursor(_))
        ));
        let mut tampered = request("f", c, 1);
        tampered.cursor = first.cursor.map(|cursor| {
            let (scope, _) = cursor.split_once(':').unwrap();
            format!("{scope}:{}:0:", "e".repeat(40))
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
        let mut request = request("f", head, 3);
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
        let mut request = request("f", b, 10);
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
        let mut request = request("f", ids[5], 2);
        request.focus_commit = Some(ids[0].to_string());
        let page = file_history(&fixture.active, None, &request, budget).unwrap();
        assert_eq!(page.focus, Some(FocusOutcome::OutsideBudget));
        assert_eq!(page.rows[0].commit.id, ids[5].to_string());
    }

    /// A linear history where the file is renamed at each step: `n0`, `n1`, …
    /// Returns the commit ids oldest first. Every blob is identical, so each
    /// rename is exact.
    fn rename_chain(fixture: &Fixture, length: usize) -> Vec<Oid> {
        let mut ids = Vec::new();
        let mut parent: Vec<Oid> = Vec::new();
        for step in 0..length {
            let name = format!("n{step}");
            let id = fixture.commit(&parent, &[(name.as_str(), b"same content", FILE)]);
            ids.push(id);
            parent = vec![id];
        }
        ids
    }

    #[test]
    fn follows_an_exact_rename_and_names_each_row_at_its_commit() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("old", b"content\nline\n", FILE)]);
        let b = fixture.commit(&[a], &[("new", b"content\nline\n", FILE)]);
        let page = get_file_history(&fixture.active, None, &request("new", b, 200)).unwrap();
        assert_eq!(
            rows(&page),
            vec![(b, PathChange::Added, false), (a, PathChange::Added, false)]
        );
        assert_eq!(page.rows[0].path_at_commit, "new");
        assert_eq!(page.rows[0].renamed_from.as_deref(), Some("old"));
        assert_eq!(page.rows[1].path_at_commit, "old");
        assert_eq!(page.rows[1].renamed_from, None);
        assert!(page.rows.iter().all(|row| row.lineage.is_none()));
    }

    #[test]
    fn follows_a_rename_with_edits_above_the_similarity_threshold() {
        let fixture = Fixture::new();
        let original: &[u8] = b"one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n";
        let edited: &[u8] = b"one\ntwo\nthree\nfour\nfive\nsix\nseven\nnine\n";
        let a = fixture.commit(&[], &[("old", original, FILE)]);
        let b = fixture.commit(&[a], &[("new", edited, FILE)]);
        let page = get_file_history(&fixture.active, None, &request("new", b, 200)).unwrap();
        assert_eq!(page.rows.len(), 2);
        assert_eq!(page.rows[0].renamed_from.as_deref(), Some("old"));
        assert_eq!(page.rows[1].path_at_commit, "old");
    }

    #[test]
    fn a_dissimilar_replacement_is_a_new_file_and_the_lineage_ends() {
        let fixture = Fixture::new();
        let a = fixture.commit(&[], &[("old", b"alpha\nbeta\ngamma\ndelta\n", FILE)]);
        let b = fixture.commit(&[a], &[("new", b"zeta\neta\ntheta\niota\n", FILE)]);
        let page = get_file_history(&fixture.active, None, &request("new", b, 200)).unwrap();
        assert_eq!(rows(&page), vec![(b, PathChange::Added, false)]);
        assert_eq!(page.rows[0].renamed_from, None);
    }

    #[test]
    fn a_rename_inside_a_merge_is_not_searched_and_the_lineage_ends() {
        let fixture = Fixture::new();
        let root = fixture.commit(&[], &[("old", b"content\nline\n", FILE)]);
        let first = fixture.commit(
            &[root],
            &[("old", b"content\nline\n", FILE), ("h", b"a", FILE)],
        );
        let side = fixture.commit(
            &[root],
            &[("h", b"b", FILE), ("old", b"content\nline\n", FILE)],
        );
        let merge = fixture.commit(&[first, side], &[("new", b"content\nline\n", FILE)]);
        let page = get_file_history(&fixture.active, None, &request("new", merge, 200)).unwrap();
        assert_eq!(rows(&page), vec![(merge, PathChange::Added, true)]);
        assert_eq!(page.rows[0].renamed_from, None);
    }

    #[test]
    fn the_rename_budget_ends_the_lineage_with_a_row_notice() {
        let fixture = Fixture::new();
        let chain = rename_chain(
            &fixture,
            usize::try_from(MAX_RENAMES_PER_QUERY).unwrap() + 2,
        );
        let head = *chain.last().unwrap();
        let name = format!("n{}", chain.len() - 1);
        let page = get_file_history(&fixture.active, None, &request(&name, head, 200)).unwrap();
        // The head plus one rename per step, the final step cut off by the budget.
        assert_eq!(
            page.rows.len(),
            usize::try_from(MAX_RENAMES_PER_QUERY).unwrap() + 1
        );
        let last = page.rows.last().unwrap();
        assert_eq!(last.lineage, Some(Truncation::RenameLimit));
        assert_eq!(last.renamed_from, None);
    }

    #[test]
    fn a_commit_changing_too_many_files_skips_rename_search_with_a_notice() {
        let fixture = Fixture::new();
        let before: Vec<(String, Vec<u8>, u32)> = (0..2_000)
            .map(|index| (format!("p{index}"), b"x".to_vec(), FILE))
            .collect();
        let snapshot: Vec<(&str, &[u8], u32)> = before
            .iter()
            .map(|(path, content, mode)| (path.as_str(), content.as_slice(), *mode))
            .collect();
        let a = fixture.commit(&[], &snapshot);
        let b = fixture.commit(&[a], &[("new", b"content", FILE)]);
        let page = get_file_history(&fixture.active, None, &request("new", b, 200)).unwrap();
        assert_eq!(page.rows.len(), 1);
        assert_eq!(page.rows[0].lineage, Some(Truncation::RenameSearchSkipped));
        assert_eq!(page.rows[0].renamed_from, None);
    }

    #[test]
    fn every_page_size_reproduces_the_rename_chain_exactly() {
        let fixture = Fixture::new();
        let chain = rename_chain(&fixture, 8);
        let head = *chain.last().unwrap();
        let full = fixture.all_rows(None, "n7", head, 200);
        assert_eq!(full.len(), 8);
        let names = |rows: &[FileHistoryRow]| -> Vec<(String, Option<String>)> {
            rows.iter()
                .map(|row| (row.path_at_commit.clone(), row.renamed_from.clone()))
                .collect()
        };
        for limit in [1u16, 3] {
            let paged = fixture.all_rows(None, "n7", head, limit);
            assert_eq!(names(&paged), names(&full), "limit {limit}");
        }
        assert_eq!(full.last().unwrap().path_at_commit, "n0");
        assert!(full.iter().all(|row| row.lineage.is_none()));
    }

    #[test]
    fn cached_rename_history_matches_the_uncached_one() {
        let fixture = Fixture::new();
        let chain = rename_chain(&fixture, 6);
        let head = *chain.last().unwrap();
        let reader = HistoryReader::with_budget(1_000);
        assert_eq!(
            fixture.all_ids(Some(&reader), "n5", head, 2),
            fixture.all_ids(None, "n5", head, 2)
        );
    }

    #[test]
    fn frontier_hex_round_trips_names_with_separators() {
        let followed = BTreeMap::from([(Oid::ZERO_SHA1, "dir, a=b:c/µ.txt".to_owned())]);
        let encoded = encode_cursor("ab", Some(Oid::ZERO_SHA1), &followed, 3)
            .unwrap()
            .unwrap();
        let scope = format!("{}{}", "a".repeat(63), "b");
        let parsed = parse_cursor(&encoded.replacen("ab:", &format!("{scope}:"), 1)).unwrap();
        assert_eq!(parsed.frontier, followed);
        assert_eq!(parsed.renames, 3);
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
        let request = request("f", head, 50);
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
