//! The current working tree, split into staged and unstaged changes.
//!
//! This module is the only owner of local-change semantics. It deliberately
//! exposes a bounded summary first and loads one file's patch or contents on
//! demand, so a large repository cannot turn one IPC call into an unbounded
//! allocation in the UI.

use std::{
    fs::{self, File, Metadata},
    io::Read,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use git2::{DiffOptions, Index, ObjectType, Repository, StatusOptions};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    blob::{self, ContentRead},
    diff::{self, FileDiff, FileDiffSummary},
    error::AppError,
    repository::ActiveRepo,
};

/// Maximum number of file summaries returned in one page.
pub const WORKTREE_PAGE_SIZE: usize = 250;

/// Which side of the local changes the caller wants to inspect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum WorktreeSide {
    Staged,
    Unstaged,
}

impl WorktreeSide {
    #[must_use]
    pub const fn is_staged(self) -> bool {
        matches!(self, Self::Staged)
    }
}

/// A bounded page of local file summaries.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeDiffPage {
    pub side: WorktreeSide,
    pub revision: String,
    pub files: Vec<FileDiffSummary>,
    pub total_files: u32,
    pub next_cursor: Option<String>,
    pub insertions: u32,
    pub deletions: u32,
}

/// Both sides share one revision and one React Query cache entry.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeSnapshot {
    pub revision: String,
    pub staged: WorktreeDiffPage,
    pub unstaged: WorktreeDiffPage,
}

/// The combined initial snapshot request.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeSnapshotRequest {
    pub staged_cursor: Option<String>,
    pub unstaged_cursor: Option<String>,
    pub limit: Option<u16>,
    pub expected_revision: Option<String>,
}

/// A single detailed local diff, fetched after a file is selected.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFileDiffRequest {
    pub side: WorktreeSide,
    pub path: String,
    pub expected_revision: Option<String>,
    pub expand: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFileDiff {
    pub side: WorktreeSide,
    pub revision: String,
    pub file: FileDiff,
}

/// Reads a local file from the index or disk.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFileContentRequest {
    pub side: WorktreeSide,
    pub path: String,
    pub expected_revision: Option<String>,
    pub expand: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFileContent {
    pub side: WorktreeSide,
    pub revision: String,
    pub path: String,
    pub lines: u32,
    pub bytes: String,
    pub omitted: Option<diff::DiffOmission>,
    pub text: Option<String>,
}

/// Lightweight revision used by the fallback poller and stale-read guard.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFingerprint {
    pub revision: String,
}

/// Reads both local change sets in one operation.
///
/// # Errors
///
/// Returns a typed Git, filesystem, stale-revision or resource error when the
/// repository cannot be read consistently within the request contract.
pub fn get_worktree_snapshot(
    active: &ActiveRepo,
    request: &WorktreeSnapshotRequest,
) -> Result<WorktreeSnapshot, AppError> {
    let repo = active.open()?;
    let index = repo.index()?;
    let before = revision(&repo, &index)?;
    if let Some(expected) = request.expected_revision.as_deref() {
        ensure_revision(&before, expected)?;
    }

    let staged_files = collect_summaries(&repo, &index, WorktreeSide::Staged)?;
    let unstaged_files = collect_summaries(&repo, &index, WorktreeSide::Unstaged)?;
    let after = revision(&repo, &repo.index()?)?;
    ensure_revision(&before, &after)?;

    Ok(WorktreeSnapshot {
        revision: before.clone(),
        staged: page(
            WorktreeSide::Staged,
            before.clone(),
            &staged_files,
            request.staged_cursor.as_deref(),
            request.limit,
        )?,
        unstaged: page(
            WorktreeSide::Unstaged,
            before,
            &unstaged_files,
            request.unstaged_cursor.as_deref(),
            request.limit,
        )?,
    })
}

/// Fetches one detailed local diff.
///
/// # Errors
///
/// Returns a typed error when the requested path is invalid, unavailable in
/// the selected side, stale, or larger than the explicit patch budget.
pub fn get_worktree_file_diff(
    active: &ActiveRepo,
    request: &WorktreeFileDiffRequest,
) -> Result<WorktreeFileDiff, AppError> {
    validate_relative_path(&request.path)?;
    let repo = active.open()?;
    let index = repo.index()?;
    let before = revision(&repo, &index)?;
    if let Some(expected) = request.expected_revision.as_deref() {
        ensure_revision(&before, expected)?;
    }

    let mut diff = build_diff(&repo, &index, request.side)?;
    diff.find_similar(None)?;
    let file = diff::collect_file(&diff, &request.path, request.expand)?
        .ok_or_else(|| AppError::WorktreeFileUnavailable(request.path.clone()))?;
    let after = revision(&repo, &repo.index()?)?;
    ensure_revision(&before, &after)?;

    Ok(WorktreeFileDiff {
        side: request.side,
        revision: before,
        file,
    })
}

/// Reads a single file and refuses to return a mixed-version result.
///
/// # Errors
///
/// Returns a typed error for unsafe paths, unavailable sources, stale reads,
/// invalid text resources or a file beyond the explicit content budget.
pub fn get_worktree_file_content(
    active: &ActiveRepo,
    request: &WorktreeFileContentRequest,
) -> Result<WorktreeFileContent, AppError> {
    validate_relative_path(&request.path)?;
    let repo = active.open()?;
    let index = repo.index()?;
    let before = revision(&repo, &index)?;
    if let Some(expected) = request.expected_revision.as_deref() {
        ensure_revision(&before, expected)?;
    }

    let content = if request.side.is_staged() {
        read_index_content(&repo, &index, &request.path, request.expand)
    } else {
        let path = resolve_worktree_file(&repo, &request.path)?;
        ensure_visible_worktree_file(&repo, &index, &request.path)?;
        read_disk_content(&path, &request.path, request.expand)
    }?;

    let after = revision(&repo, &repo.index()?)?;
    ensure_revision(&before, &after)?;

    Ok(WorktreeFileContent {
        side: request.side,
        revision: before,
        path: request.path.clone(),
        lines: content.lines,
        bytes: content.bytes,
        omitted: content.omitted,
        text: content.text,
    })
}

/// Computes a deterministic fingerprint for fallback polling.
///
/// # Errors
///
/// Returns a typed repository or Git error when the fingerprint cannot be
/// calculated.
pub fn get_worktree_fingerprint(active: &ActiveRepo) -> Result<WorktreeFingerprint, AppError> {
    let repo = active.open()?;
    let index = repo.index()?;
    Ok(WorktreeFingerprint {
        revision: revision(&repo, &index)?,
    })
}

fn collect_summaries(
    repo: &Repository,
    index: &Index,
    side: WorktreeSide,
) -> Result<Vec<FileDiffSummary>, AppError> {
    let mut diff = build_diff(repo, index, side)?;
    diff.find_similar(None)?;
    diff::collect_summaries(&diff)
}

fn build_diff<'repo>(
    repo: &'repo Repository,
    index: &'repo Index,
    side: WorktreeSide,
) -> Result<git2::Diff<'repo>, AppError> {
    let mut options = DiffOptions::new();
    let max_size = i64::try_from(blob::MAX_EXPANDED_CONTENT_BYTES).map_err(|_| {
        AppError::ResourceLimitExceeded("content limit does not fit libgit2".to_owned())
    })?;
    options
        .include_typechange(true)
        .ignore_submodules(true)
        .context_lines(3)
        .max_size(max_size);

    if side.is_staged() {
        let head_tree = repo
            .head()
            .ok()
            .and_then(|head| head.peel_to_commit().ok())
            .map(|commit| commit.tree())
            .transpose()?;
        Ok(repo.diff_tree_to_index(head_tree.as_ref(), Some(index), Some(&mut options))?)
    } else {
        options
            // Include new project files, while Git's ignore rules keep
            // generated and external files out of the view.
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);
        Ok(repo.diff_index_to_workdir(Some(index), Some(&mut options))?)
    }
}

fn page(
    side: WorktreeSide,
    revision: String,
    files: &[FileDiffSummary],
    cursor: Option<&str>,
    requested_limit: Option<u16>,
) -> Result<WorktreeDiffPage, AppError> {
    let offset = cursor
        .unwrap_or("0")
        .parse::<usize>()
        .map_err(|_| AppError::InvalidInput("invalid worktree cursor".into()))?;
    let limit = requested_limit
        .map_or(WORKTREE_PAGE_SIZE, usize::from)
        .clamp(1, WORKTREE_PAGE_SIZE);
    if offset > files.len() {
        return Err(AppError::StaleCursor(
            "worktree page is no longer available".into(),
        ));
    }

    let end = offset.saturating_add(limit).min(files.len());
    let page_files = files
        .get(offset..end)
        .ok_or_else(|| AppError::StaleCursor("worktree page is no longer available".into()))?
        .to_vec();
    let next_cursor = (end < files.len()).then(|| end.to_string());
    let insertions = files
        .iter()
        .map(|file| file.insertions)
        .fold(0u32, u32::saturating_add);
    let deletions = files
        .iter()
        .map(|file| file.deletions)
        .fold(0u32, u32::saturating_add);

    Ok(WorktreeDiffPage {
        side,
        revision,
        total_files: u32::try_from(files.len()).unwrap_or(u32::MAX),
        files: page_files,
        next_cursor,
        insertions,
        deletions,
    })
}

fn read_index_content(
    repo: &Repository,
    index: &Index,
    path: &str,
    expand: bool,
) -> Result<ContentRead, AppError> {
    let relative = Path::new(path);
    if index.conflict_get(relative).is_ok() {
        return Err(AppError::WorktreeFileUnavailable(format!(
            "{path} is in an unresolved index conflict"
        )));
    }
    let entry = index
        .get_path(relative, 0)
        .ok_or_else(|| AppError::WorktreeFileUnavailable(path.to_owned()))?;
    let blob = repo.find_blob(entry.id)?;
    blob::read_content(blob.content(), path, expand)
}

fn read_disk_content(
    path: &Path,
    display_path: &str,
    expand: bool,
) -> Result<ContentRead, AppError> {
    for _attempt in 0..2 {
        let before = file_stamp(path)?;
        if before.0 > blob::MAX_INITIAL_CONTENT_BYTES as u64 && !expand {
            let result = blob::too_large_content(before.0, display_path, false)?;
            if file_stamp(path)? == before {
                return Ok(result);
            }
            continue;
        }
        if before.0 > blob::MAX_EXPANDED_CONTENT_BYTES as u64 {
            return blob::too_large_content(before.0, display_path, expand);
        }

        let file = File::open(path)?;
        let mut bytes = Vec::new();
        file.take((blob::MAX_EXPANDED_CONTENT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)?;
        if bytes.len() > blob::MAX_EXPANDED_CONTENT_BYTES {
            return blob::too_large_content(bytes.len() as u64, display_path, true);
        }
        let after = file_stamp(path)?;
        if before != after {
            continue;
        }
        return blob::read_content(&bytes, display_path, expand);
    }
    Err(AppError::WorktreeChanged(display_path.to_owned()))
}

fn ensure_visible_worktree_file(
    repo: &Repository,
    index: &Index,
    path: &str,
) -> Result<(), AppError> {
    if index.get_path(Path::new(path), 0).is_some() {
        Ok(())
    } else {
        let mut statuses = StatusOptions::new();
        statuses
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .include_ignored(false)
            .exclude_submodules(true)
            .pathspec(path);
        if repo
            .statuses(Some(&mut statuses))?
            .iter()
            .any(|entry| entry.path().is_ok_and(|candidate| candidate == path))
        {
            Ok(())
        } else {
            Err(AppError::WorktreeFileUnavailable(format!(
                "{path} is not a visible Git worktree file"
            )))
        }
    }
}

fn resolve_worktree_file(repo: &Repository, path: &str) -> Result<PathBuf, AppError> {
    let worktree = repo
        .workdir()
        .ok_or_else(|| AppError::InvalidRepository("Bare repositories are not supported".into()))?;
    let candidate = worktree.join(validate_relative_path(path)?);
    let metadata = fs::symlink_metadata(&candidate).map_err(|error| {
        AppError::WorktreeFileUnavailable(format!("{path} cannot be read: {error}"))
    })?;
    if !metadata.file_type().is_file() && !metadata.file_type().is_symlink() {
        return Err(AppError::WorktreeFileUnavailable(format!(
            "{path} is not a regular file"
        )));
    }
    let canonical = candidate.canonicalize().map_err(|error| {
        AppError::WorktreeFileUnavailable(format!("{path} cannot be resolved: {error}"))
    })?;
    if !canonical.starts_with(worktree) {
        return Err(AppError::PathOutsideRepository(path.to_owned()));
    }
    if !canonical.is_file() {
        return Err(AppError::WorktreeFileUnavailable(path.to_owned()));
    }
    Ok(canonical)
}

fn validate_relative_path(path: &str) -> Result<PathBuf, AppError> {
    let candidate = Path::new(path);
    if path.is_empty() || candidate.is_absolute() {
        return Err(AppError::PathOutsideRepository(path.to_owned()));
    }
    if candidate.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(AppError::PathOutsideRepository(path.to_owned()));
    }
    Ok(candidate.to_path_buf())
}

fn revision(repo: &Repository, index: &Index) -> Result<String, AppError> {
    let mut fingerprint = Vec::new();
    if let Ok(head) = repo.head() {
        if let Some(target) = head.target() {
            fingerprint.extend_from_slice(target.as_bytes());
        }
    }
    for entry in index.iter() {
        fingerprint.extend_from_slice(entry.path.as_ref());
        fingerprint.extend_from_slice(entry.id.as_bytes());
        fingerprint.extend_from_slice(&entry.mode.to_le_bytes());
    }

    let mut statuses = StatusOptions::new();
    statuses
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .exclude_submodules(true);
    for entry in repo.statuses(Some(&mut statuses))?.iter() {
        fingerprint.extend_from_slice(&entry.status().bits().to_le_bytes());
        if let Ok(path) = entry.path() {
            fingerprint.extend_from_slice(path.as_bytes());
            if let Some(workdir) = repo.workdir() {
                let file = workdir.join(path);
                if let Ok(metadata) = fs::symlink_metadata(file) {
                    append_metadata(&mut fingerprint, &metadata);
                }
            }
        }
    }

    Ok(git2::Oid::hash_object(ObjectType::Blob, &fingerprint)?.to_string())
}

fn append_metadata(output: &mut Vec<u8>, metadata: &Metadata) {
    output.extend_from_slice(&metadata.len().to_le_bytes());
    if let Ok(modified) = metadata.modified() {
        if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
            output.extend_from_slice(&duration.as_secs().to_le_bytes());
            output.extend_from_slice(&duration.subsec_nanos().to_le_bytes());
        }
    }
}

fn file_stamp(path: &Path) -> Result<(u64, u64, u32), AppError> {
    let metadata = fs::metadata(path)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok());
    Ok((
        metadata.len(),
        modified.map_or(0, |time| time.as_secs()),
        modified.map_or(0, |time| time.subsec_nanos()),
    ))
}

fn ensure_revision(actual: &str, expected: &str) -> Result<(), AppError> {
    if actual == expected {
        Ok(())
    } else {
        Err(AppError::WorktreeChanged(
            "repository revision is stale".into(),
        ))
    }
}
