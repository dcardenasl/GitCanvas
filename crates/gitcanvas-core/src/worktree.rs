//! The current working tree, split into staged and unstaged changes.
//!
//! This module is the only owner of local-change semantics. It deliberately
//! exposes a bounded summary first and loads one file's patch or contents on
//! demand, so a large repository cannot turn one IPC call into an unbounded
//! allocation in the UI.

use std::{
    fs::{self, File, Metadata, OpenOptions},
    hash::{DefaultHasher, Hash, Hasher},
    io::Read,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use git2::{DiffOptions, Index, Repository, StatusOptions};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    blob::{self, ContentRead, FileContentFields},
    diff::{self, FileDiff, FileDiffSummary},
    error::AppError,
    pagination::resolve_page_size,
    repository::ActiveRepo,
};

/// Maximum number of file summaries returned in one page.
pub const WORKTREE_PAGE_SIZE: usize = 250;

/// Which side of the local changes the caller wants to inspect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum WorktreeSide {
    /// Changes already staged in the index.
    Staged,
    /// Changes in the working directory that are not staged.
    Unstaged,
}

impl WorktreeSide {
    /// Returns whether this side represents staged changes.
    #[must_use]
    const fn is_staged(self) -> bool {
        matches!(self, Self::Staged)
    }
}

/// A bounded page of local file summaries.
///
/// `next_cursor` is `"<revision>:<offset>"`: the position is bound to the listing
/// it was read from and is refused as stale once the changes have moved on.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeDiffPage {
    /// Side of the working tree represented by this page.
    pub side: WorktreeSide,
    /// Revision token shared by the snapshot and its pages.
    pub revision: String,
    /// Changed files included in this page.
    pub files: Vec<FileDiffSummary>,
    /// Total number of changed files on this side.
    pub total_files: u32,
    /// Cursor for the next page, or `None` when complete.
    pub next_cursor: Option<String>,
    /// Total inserted lines across this side.
    pub insertions: u32,
    /// Total deleted lines across this side.
    pub deletions: u32,
}

/// Both sides share one revision and one React Query cache entry.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeSnapshot {
    /// Revision token that identifies both sides of this snapshot.
    pub revision: String,
    /// Staged changes at this revision.
    pub staged: WorktreeDiffPage,
    /// Unstaged changes at this revision.
    pub unstaged: WorktreeDiffPage,
}

/// The combined initial snapshot request.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeSnapshotRequest {
    /// Staged-side cursor, if requesting a later page.
    pub staged_cursor: Option<String>,
    /// Unstaged-side cursor, if requesting a later page.
    pub unstaged_cursor: Option<String>,
    /// Maximum number of files to return, or `None` for the default.
    pub limit: Option<u16>,
    /// Revision that must still be current for a paged read.
    pub expected_revision: Option<String>,
}

/// A single detailed local diff, fetched after a file is selected.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFileDiffRequest {
    /// Side containing the requested file.
    pub side: WorktreeSide,
    /// Repository-relative file path.
    pub path: String,
    /// Revision token from the snapshot used to select the file.
    pub expected_revision: Option<String>,
    /// Whether to bypass the ordinary patch-size limit.
    pub expand: bool,
}

/// One selected worktree file diff tied to its source revision.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFileDiff {
    /// Side containing the file.
    pub side: WorktreeSide,
    /// Revision from which the patch was read.
    pub revision: String,
    /// File summary and selected patch.
    pub file: FileDiff,
}

/// Reads a local file from the index or disk.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFileContentRequest {
    /// Side containing the requested file.
    pub side: WorktreeSide,
    /// Repository-relative file path.
    pub path: String,
    /// Revision token from the snapshot used to select the file.
    pub expected_revision: Option<String>,
    /// Whether to bypass the ordinary content-size limit.
    pub expand: bool,
}

/// File text and metadata read from one worktree revision.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFileContent {
    /// Side from which the file was read.
    pub side: WorktreeSide,
    /// Revision from which the file was read.
    pub revision: String,
    /// Shared file content and bounded-read metadata.
    #[serde(flatten)]
    pub fields: FileContentFields,
}

impl std::ops::Deref for WorktreeFileContent {
    type Target = FileContentFields;

    fn deref(&self) -> &Self::Target {
        &self.fields
    }
}

/// Lightweight revision used by the fallback poller and stale-read guard.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WorktreeFingerprint {
    /// Compact revision token for the current local changes.
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
    let limit = resolve_page_size(request.limit, WORKTREE_PAGE_SIZE, WORKTREE_PAGE_SIZE)?;
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
            limit,
        )?,
        unstaged: page(
            WorktreeSide::Unstaged,
            before,
            &unstaged_files,
            request.unstaged_cursor.as_deref(),
            limit,
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
        let path = resolve_worktree_file(active, &request.path)?;
        ensure_visible_worktree_file(&repo, &index, &request.path)?;
        read_disk_content(&path, active.path(), &request.path, request.expand)
    }?;

    let after = revision(&repo, &repo.index()?)?;
    ensure_revision(&before, &after)?;

    Ok(WorktreeFileContent {
        side: request.side,
        revision: before,
        fields: FileContentFields {
            path: request.path.clone(),
            lines: content.lines,
            bytes: content.bytes,
            omitted: content.omitted,
            text: content.text,
        },
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
    limit: usize,
) -> Result<WorktreeDiffPage, AppError> {
    let offset = match cursor {
        None => 0,
        Some(cursor) => {
            let (cursor_revision, offset) = cursor
                .split_once(':')
                .ok_or_else(|| AppError::InvalidInput("invalid worktree cursor".into()))?;
            // A position is only meaningful in the listing it was taken from. If
            // the changes moved on, the same offset names a different file.
            if cursor_revision != revision {
                return Err(AppError::StaleCursor(
                    "local changes changed since this page was loaded".into(),
                ));
            }
            offset
                .parse::<usize>()
                .map_err(|_| AppError::InvalidInput("invalid worktree cursor".into()))?
        }
    };
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
    let next_cursor = (end < files.len()).then(|| format!("{revision}:{end}"));
    let (insertions, deletions) =
        files
            .iter()
            .fold((0_u32, 0_u32), |(insertions, deletions), file| {
                (
                    insertions.saturating_add(file.insertions),
                    deletions.saturating_add(file.deletions),
                )
            });

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
    blob::read_blob_content(&blob, path, expand)
}

fn read_disk_content(
    path: &Path,
    repository_root: &Path,
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

        let mut file = OpenOptions::new().read(true).open(path)?;
        verify_open_file(path, repository_root, &file, display_path)?;
        let mut bytes = Vec::new();
        (&mut file)
            .take((blob::MAX_EXPANDED_CONTENT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)?;
        if bytes.len() > blob::MAX_EXPANDED_CONTENT_BYTES {
            return blob::too_large_content(bytes.len() as u64, display_path, true);
        }
        verify_open_file(path, repository_root, &file, display_path)?;
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

fn resolve_worktree_file(active: &ActiveRepo, path: &str) -> Result<PathBuf, AppError> {
    let relative = validate_relative_path(path)?;
    let repository_root = active.path();
    let candidate = repository_root.join(relative);
    let mut component_path = repository_root.to_path_buf();
    for component in Path::new(path).components() {
        if let Component::Normal(name) = component {
            component_path.push(name);
            let metadata = fs::symlink_metadata(&component_path).map_err(|error| {
                AppError::WorktreeFileUnavailable(format!("{path} cannot be read: {error}"))
            })?;
            if metadata.file_type().is_symlink() {
                let target = component_path.canonicalize().map_err(|error| {
                    AppError::WorktreeFileUnavailable(format!("{path} cannot be resolved: {error}"))
                })?;
                if !target.starts_with(repository_root) {
                    return Err(AppError::PathOutsideRepository(path.to_owned()));
                }
                return Err(AppError::WorktreeFileUnavailable(format!(
                    "{path} uses a symbolic link, which is not supported"
                )));
            }
        }
    }
    let metadata = fs::symlink_metadata(&candidate).map_err(|error| {
        AppError::WorktreeFileUnavailable(format!("{path} cannot be read: {error}"))
    })?;
    if !metadata.file_type().is_file() {
        return Err(AppError::WorktreeFileUnavailable(format!(
            "{path} is not a regular file"
        )));
    }
    let canonical = candidate.canonicalize().map_err(|error| {
        AppError::WorktreeFileUnavailable(format!("{path} cannot be resolved: {error}"))
    })?;
    if !canonical.starts_with(repository_root) {
        return Err(AppError::PathOutsideRepository(path.to_owned()));
    }
    if !canonical.is_file() {
        return Err(AppError::WorktreeFileUnavailable(path.to_owned()));
    }
    Ok(canonical)
}

fn verify_open_file(
    path: &Path,
    repository_root: &Path,
    file: &File,
    display_path: &str,
) -> Result<(), AppError> {
    let changed = || AppError::WorktreeChanged(display_path.to_owned());
    let opened = file.metadata().map_err(|_| changed())?;
    if !opened.is_file() {
        return Err(changed());
    }
    let current = fs::symlink_metadata(path).map_err(|_| changed())?;
    if !current.file_type().is_file() || current.file_type().is_symlink() {
        return Err(changed());
    }
    let canonical = path.canonicalize().map_err(|_| changed())?;
    if !canonical.starts_with(repository_root)
        || canonical != path
        || !same_file_identity(file, path, &opened, &current)
    {
        return Err(changed());
    }
    Ok(())
}

#[cfg(unix)]
fn same_file_identity(_file: &File, _path: &Path, opened: &Metadata, current: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;

    opened.dev() == current.dev() && opened.ino() == current.ino()
}

#[cfg(windows)]
fn same_file_identity(file: &File, path: &Path, _opened: &Metadata, _current: &Metadata) -> bool {
    // `MetadataExt::file_index` is still unstable, so compare handles instead.
    let Ok(clone) = file.try_clone() else {
        return false;
    };
    match (
        same_file::Handle::from_file(clone),
        same_file::Handle::from_path(path),
    ) {
        (Ok(opened), Ok(current)) => opened == current,
        _ => false,
    }
}

#[cfg(not(any(unix, windows)))]
fn same_file_identity(_file: &File, _path: &Path, opened: &Metadata, current: &Metadata) -> bool {
    opened.is_file()
        && current.is_file()
        && opened.len() == current.len()
        && opened.modified().ok() == current.modified().ok()
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
        ) || matches!(component, Component::Normal(name) if name == ".git")
    }) {
        return Err(AppError::PathOutsideRepository(path.to_owned()));
    }
    Ok(candidate.to_path_buf())
}

fn revision(repo: &Repository, index: &Index) -> Result<String, AppError> {
    // This opaque token is compared within one app session; it is not a durable or
    // cryptographic identifier. Hash fields incrementally to avoid a repository-sized buffer.
    let mut fingerprint = DefaultHasher::new();
    if let Ok(head) = repo.head() {
        if let Some(target) = head.target() {
            1u8.hash(&mut fingerprint);
            target.as_bytes().hash(&mut fingerprint);
        }
    } else {
        0u8.hash(&mut fingerprint);
    }
    index.len().hash(&mut fingerprint);
    for entry in index.iter() {
        entry.path.as_slice().hash(&mut fingerprint);
        entry.id.as_bytes().hash(&mut fingerprint);
        entry.mode.hash(&mut fingerprint);
    }

    let mut statuses = StatusOptions::new();
    statuses
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .exclude_submodules(true);
    let statuses = repo.statuses(Some(&mut statuses))?;
    statuses.len().hash(&mut fingerprint);
    for entry in statuses.iter() {
        entry.status().bits().hash(&mut fingerprint);
        if let Ok(path) = entry.path() {
            path.hash(&mut fingerprint);
            if let Some(workdir) = repo.workdir() {
                let file = workdir.join(path);
                if let Ok(metadata) = fs::symlink_metadata(file) {
                    1u8.hash(&mut fingerprint);
                    append_metadata(&mut fingerprint, &metadata);
                } else {
                    0u8.hash(&mut fingerprint);
                }
            }
        } else {
            None::<&str>.hash(&mut fingerprint);
        }
    }

    Ok(format!("{:016x}", fingerprint.finish()))
}

fn append_metadata(output: &mut impl Hasher, metadata: &Metadata) {
    metadata.len().hash(output);
    metadata.is_file().hash(output);
    metadata.is_dir().hash(output);
    metadata.file_type().is_symlink().hash(output);
    modified_stamp(metadata).hash(output);
}

fn modified_stamp(metadata: &Metadata) -> Option<(u64, u32)> {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| (duration.as_secs(), duration.subsec_nanos()))
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

#[cfg(test)]
mod serialization_tests {
    use super::{WorktreeFileContent, WorktreeSide};
    use crate::{blob::FileContentFields, diff::DiffOmission};

    #[test]
    fn worktree_content_flattens_shared_fields_on_the_wire() {
        let content = WorktreeFileContent {
            side: WorktreeSide::Unstaged,
            revision: "revision-1".to_owned(),
            fields: FileContentFields {
                path: "README.md".to_owned(),
                lines: 3,
                bytes: "12".to_owned(),
                omitted: Some(DiffOmission::TooLarge),
                text: None,
            },
        };

        assert_eq!(
            serde_json::to_value(content).unwrap(),
            serde_json::json!({
                "side": "unstaged",
                "revision": "revision-1",
                "path": "README.md",
                "lines": 3,
                "bytes": "12",
                "omitted": "TooLarge",
                "text": null
            })
        );
    }
}
