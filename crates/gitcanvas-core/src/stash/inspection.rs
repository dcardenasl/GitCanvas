//! Public contracts for immutable stash comparisons and bounded file reads.

use serde::{Deserialize, Serialize};
use specta::Type;

use super::{comparison::Comparison, count, Cursor, MAX_STASH_CURSOR_BYTES};
use crate::{
    blob::{self, FileContentFields},
    diff::{self, FileDiffSummary},
    error::AppError,
    pagination::resolve_page_size,
    repository::{parse_commit_id, ActiveRepo},
};

/// Maximum changed deltas accepted before rename detection, shared with commit diffs.
pub const MAX_STASH_FILES: usize = diff::MAX_COMMIT_DIFF_FILES;
/// Default and maximum file summaries per page.
pub const STASH_FILES_PAGE_SIZE: u16 = 250;
/// Unique, readable blob bytes admitted for one comparison's statistics/rename work.
pub const MAX_STASH_COMPARISON_BLOB_BYTES: u32 = 64 * 1024 * 1024;

/// Which two saved states are compared; never the current HEAD, index or disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StashComparisonMode {
    /// Base to saved worktree, plus saved untracked files.
    All,
    /// Base to saved index.
    Staged,
    /// Saved index to saved worktree.
    Unstaged,
    /// Empty tree to the optional saved untracked tree.
    Untracked,
}

/// Origin distinguishes byte-identical names in the worktree and untracked trees.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StashFileOrigin {
    /// Saved tracked comparison.
    Tracked,
    /// Saved untracked/ignored tree.
    Untracked,
}

/// Side of the selected saved comparison.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StashContentSide {
    /// Previous path/object, including the source of a rename.
    Previous,
    /// Saved destination path/object.
    Saved,
}

/// What the saved tree entry represents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StashFileKind {
    /// Ordinary or executable file blob.
    Blob,
    /// Link target stored as a blob; never followed on disk.
    Symlink,
    /// Gitlink; no submodule repository is opened.
    Submodule,
    /// An entry that cannot be rendered as file content.
    Other,
}

/// A version resolved by the server from a validated comparison and file key.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StashFileVersion {
    /// Commit supplying this version.
    pub commit_id: String,
    /// Exact object id in that commit's tree.
    pub object_id: String,
    /// Display path, never accepted back as file identity.
    pub path: String,
    /// Whether the display path replaces invalid UTF-8 bytes.
    pub path_lossy: bool,
    /// Saved object kind.
    pub kind: StashFileKind,
}

/// Why an entry cannot have a text patch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StashPreviewUnavailable {
    /// At least one side is a submodule gitlink.
    Submodule,
    /// At least one side has another non-blob kind.
    UnsupportedEntry,
}

/// An explicit reduction of content-based rename search, not a claim of no renames.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StashInspectionNotice {
    /// Oversized objects were paired by exact id only, without reading their data.
    RenameSimilaritySkipped,
}

/// Resource policy published alongside every inspection response.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StashInspectionLimits {
    /// Changed deltas allowed before rename detection.
    pub max_files: u32,
    /// Default and maximum file summaries per page.
    pub max_page_size: u16,
    /// Maximum unique readable blob bytes for comparison work.
    pub max_comparison_blob_bytes: u32,
    /// Maximum bytes in file keys and cursors.
    pub max_key_bytes: u32,
    /// Initial patch line budget.
    pub initial_patch_lines: u32,
    /// Initial patch byte budget.
    pub initial_patch_bytes: u32,
    /// Explicit patch hard cap.
    pub expanded_patch_bytes: u32,
    /// Initial content line budget.
    pub initial_content_lines: u32,
    /// Initial content byte budget.
    pub initial_content_bytes: u32,
    /// Explicit content hard cap.
    pub expanded_content_bytes: u32,
}

impl StashInspectionLimits {
    pub(super) fn current() -> Result<Self, AppError> {
        Ok(Self {
            max_files: count(MAX_STASH_FILES)?,
            max_page_size: STASH_FILES_PAGE_SIZE,
            max_comparison_blob_bytes: MAX_STASH_COMPARISON_BLOB_BYTES,
            max_key_bytes: MAX_STASH_CURSOR_BYTES,
            initial_patch_lines: diff::LARGE_DIFF_LINE_LIMIT,
            initial_patch_bytes: count(diff::MAX_INITIAL_DIFF_BYTES)?,
            expanded_patch_bytes: count(diff::MAX_EXPANDED_DIFF_BYTES)?,
            initial_content_lines: blob::LARGE_FILE_LINE_LIMIT,
            initial_content_bytes: count(blob::MAX_INITIAL_CONTENT_BYTES)?,
            expanded_content_bytes: count(blob::MAX_EXPANDED_CONTENT_BYTES)?,
        })
    }
}

/// Frozen identity of the saved states and the effective comparison.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StashInspection {
    /// Full stash id W.
    pub stash_id: String,
    /// Base commit H.
    pub base_commit_id: String,
    /// Saved index commit I.
    pub index_commit_id: String,
    /// Optional saved untracked commit U.
    pub untracked_commit_id: Option<String>,
    /// Selected saved-state comparison.
    pub mode: StashComparisonMode,
    /// Repository, saved states and effective delta identity.
    pub revision: String,
    /// Explicit limits on interpretation of the comparison.
    pub notices: Vec<StashInspectionNotice>,
}

/// One exact delta, with reusable file metadata and independently resolved versions.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StashFileSummary {
    /// Opaque key bound to repository, stash, mode, origin and exact delta.
    pub key: String,
    /// Mode-independent raw path/origin identity for retaining a file across comparisons.
    pub path_identity: String,
    /// Saved tracked or untracked origin.
    pub origin: StashFileOrigin,
    /// Shared change metadata; the list never contains patch text.
    pub file: FileDiffSummary,
    /// False when line counts cannot be calculated without exceeding read bounds.
    pub stats_available: bool,
    /// Previous version, absent for an addition.
    pub previous: Option<StashFileVersion>,
    /// Saved version, absent for a deletion.
    pub saved: Option<StashFileVersion>,
    /// Non-blob preview limitation, independent of content-side availability.
    pub preview_unavailable: Option<StashPreviewUnavailable>,
}

/// One page of changed files from an immutable comparison.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StashFilesPage {
    /// Frozen context, preserved even if the stash is removed from the list.
    pub inspection: StashInspection,
    /// Only the requested page of summaries.
    pub files: Vec<StashFileSummary>,
    /// Total changed files in this comparison; modes must not be added together.
    pub total_files: u32,
    /// Cursor tied to this effective comparison, or `None` when complete.
    pub next_cursor: Option<String>,
    /// Engine policy, without frontend copies of limits.
    pub limits: StashInspectionLimits,
}

/// Page selection for one saved-state comparison.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct StashFilesRequest {
    /// Immutable full stash id, never a reflog index or revision expression.
    pub stash_id: String,
    /// Saved states to compare.
    pub mode: StashComparisonMode,
    /// Page size, or the engine default.
    pub limit: Option<u16>,
    /// Continuation for this comparison.
    pub cursor: Option<String>,
}

/// Identifies a selected saved file without trusting a display path or client object id.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct StashFileRequest {
    /// Immutable full stash id.
    pub stash_id: String,
    /// Comparison in which the key was issued.
    pub mode: StashComparisonMode,
    /// Opaque key issued by the file listing.
    pub file_key: String,
}

/// On-demand patch request for exactly one file.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct StashFileDiffRequest {
    /// Selected comparison and file.
    pub file: StashFileRequest,
    /// Bypass initial limits, retaining the hard patch cap.
    pub expand: bool,
}

/// One patch and its file metadata, never patches for the rest of the comparison.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StashFileDiff {
    /// Frozen saved-state context.
    pub inspection: StashInspection,
    /// File metadata for the exact requested delta.
    pub entry: StashFileSummary,
    /// Patch text, absent for binary, oversized or non-blob entries.
    pub patch: Option<String>,
    /// Engine limits.
    pub limits: StashInspectionLimits,
}

/// Whole-content request for one side of a saved comparison.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(deny_unknown_fields)]
pub struct StashFileContentRequest {
    /// Selected comparison and file.
    pub file: StashFileRequest,
    /// Previous or saved version.
    pub side: StashContentSide,
    /// Bypass initial limits, retaining the hard content cap.
    pub expand: bool,
}

/// Expected absence of renderable content, distinct from an unreadable Git object.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StashContentUnavailable {
    /// An addition has no previous side; a deletion has no saved side.
    MissingSide,
    /// A gitlink has no file blob to render.
    Submodule,
    /// The saved entry is not a supported blob.
    UnsupportedEntry,
}

/// A valid content read or explicit absence; failed object reads remain errors.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StashContentOutcome {
    /// Bounded blob content and omission metadata.
    Available {
        /// Shared content representation, including binary/size omissions.
        content: FileContentFields,
    },
    /// This side intentionally has no renderable file.
    Unavailable {
        /// Typed explanation for the caller.
        reason: StashContentUnavailable,
    },
}

/// One exact saved version and its whole-content outcome.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StashFileContent {
    /// Frozen context.
    pub inspection: StashInspection,
    /// Selected key, unchanged from the caller's validated key.
    pub file_key: String,
    /// Selected side.
    pub side: StashContentSide,
    /// Saved version, absent only for a missing side.
    pub version: Option<StashFileVersion>,
    /// Content or explicit absence.
    pub outcome: StashContentOutcome,
    /// Engine limits.
    pub limits: StashInspectionLimits,
}

/// Reads a bounded page of summaries, without producing patch text.
///
/// # Errors
/// Rejects malformed stash structures, invalid/stale cursors, missing objects and
/// comparisons exceeding published file or blob-work limits.
pub fn get_stash_files(
    active: &ActiveRepo,
    request: &StashFilesRequest,
) -> Result<StashFilesPage, AppError> {
    let limit = resolve_page_size(
        request.limit,
        usize::from(STASH_FILES_PAGE_SIZE),
        usize::from(STASH_FILES_PAGE_SIZE),
    )?;
    let id = parse_commit_id(&request.stash_id)?;
    let cursor = request.cursor.as_deref().map(Cursor::parse).transpose()?;
    let repo = active.open()?;
    let comparison = Comparison::load(&repo, id, request.mode)?;
    let total = comparison.len();
    let start = cursor.as_ref().map_or(Ok(0), |cursor| {
        cursor.position(&comparison.inspection.revision, total, |index| {
            comparison.anchor(index).ok()
        })
    })?;
    let end = start.saturating_add(limit).min(total);
    let files = (start..end)
        .map(|index| {
            comparison
                .read_file(index, false, false)
                .map(|(entry, _)| entry)
        })
        .collect::<Result<_, _>>()?;
    let next_cursor = if end < total {
        Some(
            serde_json::to_string(&Cursor {
                version: 1,
                scope: comparison.inspection.revision.clone(),
                position: count(end)?,
                anchor: comparison.anchor(end.saturating_sub(1))?,
            })
            .map_err(|error| AppError::Internal(error.to_string()))?,
        )
    } else {
        None
    };
    Ok(StashFilesPage {
        inspection: comparison.inspection,
        files,
        total_files: count(total)?,
        next_cursor,
        limits: StashInspectionLimits::current()?,
    })
}

/// Reads a patch only for the exact selected delta.
///
/// # Errors
/// Rejects a key issued for another comparison, malformed structures, missing
/// objects or work exceeding engine budgets. Oversized patches are typed omissions.
pub fn get_stash_file_diff(
    active: &ActiveRepo,
    request: &StashFileDiffRequest,
) -> Result<StashFileDiff, AppError> {
    let id = parse_commit_id(&request.file.stash_id)?;
    let key = super::comparison::FileKey::parse(&request.file.file_key)?;
    let repo = active.open()?;
    let comparison = Comparison::load(&repo, id, request.file.mode)?;
    let index = comparison.resolve_key(&key)?;
    let (entry, patch) = comparison.read_file(index, request.expand, true)?;
    Ok(StashFileDiff {
        inspection: comparison.inspection,
        entry,
        patch,
        limits: StashInspectionLimits::current()?,
    })
}

/// Reads one saved blob side after inspecting its object header and enforcing bounds.
///
/// # Errors
/// Rejects invalid/stale keys or structures, missing objects and expanded content
/// above its hard cap. Missing sides and submodules have explicit typed outcomes.
pub fn get_stash_file_content(
    active: &ActiveRepo,
    request: &StashFileContentRequest,
) -> Result<StashFileContent, AppError> {
    let id = parse_commit_id(&request.file.stash_id)?;
    let key = super::comparison::FileKey::parse(&request.file.file_key)?;
    let repo = active.open()?;
    let comparison = Comparison::load(&repo, id, request.file.mode)?;
    let index = comparison.resolve_key(&key)?;
    let version = comparison.version(index, request.side)?;
    let outcome = match &version {
        None => StashContentOutcome::Unavailable {
            reason: StashContentUnavailable::MissingSide,
        },
        Some(version) => match version.kind {
            StashFileKind::Blob | StashFileKind::Symlink => {
                let content = blob::read_blob_by_id(
                    &repo,
                    parse_commit_id(&version.object_id)?,
                    &version.path,
                    request.expand,
                )?;
                StashContentOutcome::Available {
                    content: content.into_fields(version.path.clone()),
                }
            }
            StashFileKind::Submodule => StashContentOutcome::Unavailable {
                reason: StashContentUnavailable::Submodule,
            },
            StashFileKind::Other => StashContentOutcome::Unavailable {
                reason: StashContentUnavailable::UnsupportedEntry,
            },
        },
    };
    Ok(StashFileContent {
        inspection: comparison.inspection,
        file_key: request.file.file_key.clone(),
        side: request.side,
        version,
        outcome,
        limits: StashInspectionLimits::current()?,
    })
}
