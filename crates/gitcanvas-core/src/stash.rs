//! Bounded, read-only inspection of a repository's shared stash list.
//!
//! The reflog index is a presentation alias, not an identity. Queries return
//! immutable object ids and bind continuations to the complete list revision.

mod comparison;
mod inspection;
mod reflog;
mod snapshot;

pub use inspection::{
    get_stash_file_content, get_stash_file_diff, get_stash_files, StashComparisonMode,
    StashContentOutcome, StashContentSide, StashContentUnavailable, StashFileContent,
    StashFileContentRequest, StashFileDiff, StashFileDiffRequest, StashFileKind, StashFileOrigin,
    StashFileRequest, StashFileSummary, StashFileVersion, StashFilesPage, StashFilesRequest,
    StashInspection, StashInspectionLimits, StashInspectionNotice, StashPreviewUnavailable,
    MAX_STASH_COMPARISON_BLOB_BYTES, MAX_STASH_FILES, STASH_FILES_PAGE_SIZE,
};

use git2::Reference;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;

use crate::{
    error::AppError,
    pagination::resolve_page_size,
    repository::{parse_commit_id, ActiveRepo},
};

/// Stash rows returned when no page size is specified.
pub const DEFAULT_STASH_PAGE_SIZE: u16 = 50;
/// Largest page of stash rows accepted by the engine.
pub const MAX_STASH_PAGE_SIZE: u16 = 200;
/// Maximum bytes read from one stash reflog, excluding the overflow sentinel.
pub const MAX_STASH_REFLOG_BYTES: u32 = 8 * 1024 * 1024;
/// Maximum number of entries accepted in one stash reflog snapshot.
pub const MAX_STASH_ENTRIES: u32 = 20_000;
/// Maximum bytes in one reflog entry, including its terminating newline.
pub const MAX_STASH_ENTRY_BYTES: u32 = 64 * 1024;
/// Maximum UTF-8 bytes in a caller-supplied search, before normalization.
pub const MAX_STASH_SEARCH_BYTES: u32 = 512;
/// Maximum bytes accepted in an opaque stash-list cursor.
pub const MAX_STASH_CURSOR_BYTES: u32 = 4 * 1024;

/// Bounds published by Rust rather than copied into consumers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct StashLimits {
    /// Default rows per page.
    pub default_page_size: u16,
    /// Maximum rows per page.
    pub max_page_size: u16,
    /// Maximum reflog snapshot bytes.
    pub max_reflog_bytes: u32,
    /// Maximum entries in a snapshot.
    pub max_entries: u32,
    /// Maximum entry bytes, including its newline.
    pub max_entry_bytes: u32,
    /// Maximum search bytes before normalization.
    pub max_search_bytes: u32,
    /// Maximum cursor bytes.
    pub max_cursor_bytes: u32,
}

impl StashLimits {
    const CURRENT: Self = Self {
        default_page_size: DEFAULT_STASH_PAGE_SIZE,
        max_page_size: MAX_STASH_PAGE_SIZE,
        max_reflog_bytes: MAX_STASH_REFLOG_BYTES,
        max_entries: MAX_STASH_ENTRIES,
        max_entry_bytes: MAX_STASH_ENTRY_BYTES,
        max_search_bytes: MAX_STASH_SEARCH_BYTES,
        max_cursor_bytes: MAX_STASH_CURSOR_BYTES,
    };
}

/// Branch context recorded by a recognized Git stash message, never guessed from HEAD.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StashBranch {
    /// A branch name recorded when the entry was saved.
    Named {
        /// Recorded branch name; the branch may no longer exist.
        name: String,
    },
    /// Git recorded that HEAD was detached.
    Detached,
    /// The message does not unambiguously record a branch.
    Unknown,
}

/// One reflog entry; two entries may deliberately name the same saved object.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct StashEntry {
    /// Full object id used for later inspection, independent of the current index.
    pub stash_id: String,
    /// Index in this revision, for displaying `stash@{index}` only.
    pub index: u32,
    /// Original reflog message, with invalid UTF-8 replaced only for display.
    pub message: Option<String>,
    /// Whether the displayed message contains UTF-8 replacements.
    pub message_lossy: bool,
    /// Recorded branch context, independent of currently existing references.
    pub branch: StashBranch,
    /// Reflog record time in Unix seconds, as a decimal string for JavaScript safety.
    pub recorded_at: String,
    /// Recorded timezone offset in minutes.
    pub offset_minutes: i32,
}

/// A request for a bounded page, optionally filtered across the entire snapshot.
#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct StashListRequest {
    /// Page size, or the published default.
    pub limit: Option<u16>,
    /// Opaque continuation returned by this same repository and normalized search.
    pub cursor: Option<String>,
    /// Message/recorded-branch substring, or no filter.
    pub search: Option<String>,
    /// Full id whose membership should be checked even outside the matching page.
    pub selected_stash_id: Option<String>,
}

/// A complete-snapshot count with only the requested bounded slice of rows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct StashPage {
    /// Opaque revision of this repository's complete reflog and stash reference.
    pub revision: String,
    /// Requested rows in reflog order, newest first, without deduplication.
    pub entries: Vec<StashEntry>,
    /// All reflog entries, independent of search and page size.
    pub total: u32,
    /// Matching entries in the entire snapshot.
    pub total_matches: u32,
    /// Normalized search used for this page and its cursor.
    pub search: String,
    /// Whether the requested selected id is listed anywhere; `None` if not requested.
    pub selected_present: Option<bool>,
    /// Newest alias of the selected OID across the whole snapshot, even outside search/pages.
    pub selected_entry: Option<StashEntry>,
    /// Next page, or `None` when all matching entries have been returned.
    pub next_cursor: Option<String>,
    /// Resource limits that apply to this query.
    pub limits: StashLimits,
}

/// One unique saved object anchored to its first-parent commit for graph rows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct StashAnchorEntry {
    /// Alias and metadata from the newest reflog occurrence of this object.
    pub entry: StashEntry,
    /// First parent of the stash commit (`H`).
    pub base_commit_id: String,
}

/// Complete, revision-consistent index for the currently readable stash reflog.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct StashAnchorIndex {
    /// Same snapshot identity as the stash inventory.
    pub revision: String,
    /// Unique stash objects grouped by their first parent.
    pub entries: Vec<StashAnchorEntry>,
    /// Unique objects whose commit or first parent could not be resolved.
    pub unresolved: u32,
}

/// Resolves unique stash objects to their first parent without reading trees.
///
/// The reflog snapshot is bounded by the same published limits as inventory. Invalid
/// or pruned objects are omitted from the graph index and remain visible in inventory.
///
/// # Errors
/// Returns the same authorization-independent snapshot, filesystem, repository and
/// resource errors as stash listing; malformed or inconsistent reflogs are not hidden.
pub fn get_stash_anchors(active: &ActiveRepo) -> Result<StashAnchorIndex, AppError> {
    use std::collections::HashSet;

    let snapshot = snapshot::read(active)?;
    let records = reflog::parse(&snapshot.bytes)?;
    snapshot.validate_tip(records.last().map(|record| record.id))?;
    let revision = snapshot.revision();
    let repo = active.open()?;
    let mut seen = HashSet::new();
    let mut entries = Vec::new();
    let mut unresolved = 0_usize;
    for (index, record) in records.iter().rev().enumerate() {
        if !seen.insert(record.id) {
            continue;
        }
        let base = repo
            .find_commit(record.id)
            .ok()
            .and_then(|commit| commit.parent_id(0).ok());
        let Some(base) = base else {
            unresolved = unresolved.checked_add(1).ok_or_else(|| {
                AppError::ResourceLimitExceeded("Stash count cannot be represented".into())
            })?;
            continue;
        };
        entries.push(StashAnchorEntry {
            entry: record.entry(count(index)?),
            base_commit_id: base.to_string(),
        });
    }
    Ok(StashAnchorIndex {
        revision,
        entries,
        unresolved: count(unresolved)?,
    })
}

/// Lists stashes without modifying Git, reading their objects or walking history.
///
/// Search trims outer Unicode whitespace and uses Unicode lowercase without
/// locale-specific folding, accent removal or Unicode normalization. Messages
/// remain unchanged. Cursor scope includes the canonical common Git directory,
/// the complete reflog bytes, ref target and normalized search.
///
/// # Errors
/// Returns [`AppError::InvalidInput`] for invalid requests/cursors,
/// [`AppError::StaleCursor`] for a different snapshot or search, and explicit Git,
/// filesystem, conflict or resource errors instead of an incomplete/empty list.
pub fn get_stashes(active: &ActiveRepo, request: &StashListRequest) -> Result<StashPage, AppError> {
    let limit = resolve_page_size(
        request.limit,
        usize::from(DEFAULT_STASH_PAGE_SIZE),
        usize::from(MAX_STASH_PAGE_SIZE),
    )?;
    let search = normalize_search(request.search.as_deref().unwrap_or_default())?;
    let cursor = request.cursor.as_deref().map(Cursor::parse).transpose()?;
    let selected = request
        .selected_stash_id
        .as_deref()
        .map(parse_commit_id)
        .transpose()?;
    if selected.is_some_and(|id| id.is_zero()) {
        return Err(AppError::InvalidInput("A stash id cannot be zero".into()));
    }
    let snapshot = snapshot::read(active)?;
    let records = reflog::parse(&snapshot.bytes)?;
    snapshot.validate_tip(records.last().map(|record| record.id))?;
    let revision = snapshot.revision();
    let scope = scope_id(&revision, &search)?;
    let selected_entry = selected
        .and_then(|id| {
            records
                .iter()
                .rev()
                .enumerate()
                .find(|(_, record)| record.id == id)
        })
        .map(|(index, record)| count(index).map(|index| record.entry(index)))
        .transpose()?;
    let selected_present = selected.map(|_| selected_entry.is_some());
    let matches: Vec<_> = records
        .iter()
        .rev()
        .enumerate()
        .filter(|(_, record)| record.matches(&search))
        .collect();
    let position = cursor.as_ref().map_or(Ok(0), |cursor| {
        cursor.position(&scope, matches.len(), |offset| {
            matches
                .get(offset)
                .map(|(index, record)| record.anchor(*index))
        })
    })?;
    let end = position.saturating_add(limit).min(matches.len());
    let entries = matches
        .iter()
        .skip(position)
        .take(limit)
        .map(|(index, record)| Ok(record.entry(count(*index)?)))
        .collect::<Result<_, AppError>>()?;
    let next_cursor = if end < matches.len() {
        let (index, last) = matches
            .get(end.saturating_sub(1))
            .ok_or_else(|| AppError::Internal("Stash page has no continuation anchor".into()))?;
        Some(
            serde_json::to_string(&Cursor {
                version: 1,
                scope,
                position: count(end)?,
                anchor: last.anchor(*index),
            })
            .map_err(|error| AppError::Internal(error.to_string()))?,
        )
    } else {
        None
    };
    Ok(StashPage {
        revision,
        entries,
        total: count(records.len())?,
        total_matches: count(matches.len())?,
        search,
        selected_present,
        selected_entry,
        next_cursor,
        limits: StashLimits::CURRENT,
    })
}

fn count(value: usize) -> Result<u32, AppError> {
    u32::try_from(value)
        .map_err(|_| AppError::ResourceLimitExceeded("Stash count cannot be represented".into()))
}

fn normalize_search(value: &str) -> Result<String, AppError> {
    if value.len() > MAX_STASH_SEARCH_BYTES as usize || value.contains('\0') {
        return Err(AppError::InvalidInput(format!(
            "Stash search must contain no NUL and at most {MAX_STASH_SEARCH_BYTES} UTF-8 bytes"
        )));
    }
    Ok(value.trim().to_lowercase())
}

fn recorded_branch(message: Option<&str>, lossy: bool) -> StashBranch {
    let Some(message) = message.filter(|_| !lossy) else {
        return StashBranch::Unknown;
    };
    let Some((branch, _)) = message
        .strip_prefix("WIP on ")
        .or_else(|| message.strip_prefix("On "))
        .and_then(|value| value.split_once(':'))
    else {
        return StashBranch::Unknown;
    };
    if branch == "(no branch)" {
        StashBranch::Detached
    } else if Reference::is_valid_name(&format!("refs/heads/{branch}")) {
        StashBranch::Named {
            name: branch.to_owned(),
        }
    } else {
        StashBranch::Unknown
    }
}

fn scope_id(revision: &str, search: &str) -> Result<String, AppError> {
    hash_value(&(revision, search))
}

fn hash_value(value: &impl Serialize) -> Result<String, AppError> {
    let bytes = serde_json::to_vec(value).map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    version: u8,
    scope: String,
    position: u32,
    anchor: String,
}

impl Cursor {
    fn parse(value: &str) -> Result<Self, AppError> {
        let invalid = || AppError::InvalidInput("Invalid stash continuation or file key".into());
        if value.len() > MAX_STASH_CURSOR_BYTES as usize {
            return Err(invalid());
        }
        let cursor: Self = serde_json::from_str(value).map_err(|_| invalid())?;
        if cursor.version != 1
            || cursor.position == 0
            || cursor.position >= MAX_STASH_ENTRIES
            || !is_digest(&cursor.scope)
            || !is_digest(&cursor.anchor)
        {
            return Err(invalid());
        }
        Ok(cursor)
    }

    fn position(
        &self,
        scope: &str,
        total: usize,
        anchor: impl FnOnce(usize) -> Option<String>,
    ) -> Result<usize, AppError> {
        let stale = || {
            AppError::StaleCursor("The stash listing, search or comparison changed; refresh".into())
        };
        if self.scope != scope {
            return Err(stale());
        }
        let position = self.position as usize;
        let expected = anchor(position.saturating_sub(1)).ok_or_else(stale)?;
        if position >= total || expected != self.anchor {
            return Err(stale());
        }
        Ok(position)
    }
}

fn is_digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// Cheap opaque metadata revision for active-project backup polling.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StashFingerprint {
    /// Ref target and reflog metadata, not a durable or cryptographic content identity.
    pub revision: String,
}

/// Reads stash metadata without opening or allocating the reflog's contents.
///
/// # Errors
/// Returns authorization-independent core repository/filesystem errors, unsupported
/// backend errors or invalid metadata-path errors. IPC must authorize the root first.
pub fn get_stash_fingerprint(active: &ActiveRepo) -> Result<StashFingerprint, AppError> {
    snapshot::fingerprint(active)
}
