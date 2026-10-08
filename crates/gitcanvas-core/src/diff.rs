//! First-parent commit diffs, with explicit guards for content that must not
//! be rendered as text.
//!
//! Merge commits are diffed against their first parent only. A combined diff
//! is a materially harder problem and is documented as a known limitation
//! rather than approximated: showing a merge's changes against one side while
//! implying it covers both would be worse than not showing them.

use std::collections::HashMap;

use git2::{Delta, DiffFormat, DiffOptions};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    error::AppError,
    repository::{parse_commit_id, ActiveRepo},
};

/// Lines above which a file's hunks are withheld until explicitly requested.
///
/// A generated bundle can be hundreds of thousands of lines; rendering that
/// eagerly stalls the interface for something nobody reads.
pub const LARGE_DIFF_LINE_LIMIT: u32 = 2_000;

/// Maximum patch payload returned for an ordinary request.
pub const MAX_INITIAL_DIFF_BYTES: usize = 1024 * 1024;

/// Hard maximum for a patch explicitly expanded by the user.
pub const MAX_EXPANDED_DIFF_BYTES: usize = 16 * 1024 * 1024;

/// Maximum number of changed paths accepted in one commit diff response.
pub const MAX_COMMIT_DIFF_FILES: usize = 5_000;

/// Maximum patch text bytes returned by one commit diff response.
pub const MAX_COMMIT_DIFF_BYTES: usize = MAX_EXPANDED_DIFF_BYTES;

/// How a path changed between two trees.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum FileChange {
    /// A path was added.
    Added,
    /// An existing path changed.
    Modified,
    /// A path was removed.
    Deleted,
    /// Git detected that a path moved.
    Renamed,
    /// Git detected a copy from an existing path.
    Copied,
    /// A path's object type changed.
    TypeChanged,
    /// Another change kind not represented above.
    Other,
}

impl From<Delta> for FileChange {
    fn from(delta: Delta) -> Self {
        match delta {
            Delta::Added | Delta::Untracked => Self::Added,
            Delta::Modified => Self::Modified,
            Delta::Deleted => Self::Deleted,
            Delta::Renamed => Self::Renamed,
            Delta::Copied => Self::Copied,
            Delta::Typechange => Self::TypeChanged,
            _ => Self::Other,
        }
    }
}

/// Why a file has no renderable hunks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum DiffOmission {
    /// libgit2 reports the content as binary; there is no line diff to show.
    Binary,
    /// The change is larger than `LARGE_DIFF_LINE_LIMIT` and was not requested.
    TooLarge,
}

/// One file in a commit's diff.
///
/// `patch` is `None` whenever `omitted` is set, so the two can never disagree
/// about whether there is something to render.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileDiff {
    /// Shared path, change and line-count metadata.
    #[serde(flatten)]
    pub summary: FileDiffSummary,
    /// Unified patch text for this file alone, ready for a diff renderer.
    pub patch: Option<String>,
}

impl std::ops::Deref for FileDiff {
    type Target = FileDiffSummary;

    fn deref(&self) -> &Self::Target {
        &self.summary
    }
}

/// File metadata used by large listings before a patch is requested.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileDiffSummary {
    /// Current repository-relative path.
    pub path: String,
    /// Previous path for renames and copies.
    pub old_path: Option<String>,
    /// Kind of change represented by this file entry.
    pub change: FileChange,
    /// Number of inserted lines.
    pub insertions: u32,
    /// Number of deleted lines.
    pub deletions: u32,
    /// Why the patch is omitted, if applicable.
    pub omitted: Option<DiffOmission>,
}

impl From<&FileDiff> for FileDiffSummary {
    fn from(file: &FileDiff) -> Self {
        file.summary.clone()
    }
}

/// A commit's changes against its first parent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitDiff {
    /// Commit whose changes are described.
    pub commit_id: String,
    /// The parent compared against; absent for a root commit.
    pub parent_id: Option<String>,
    /// Changed files, with a patch only for the requested path.
    pub files: Vec<FileDiff>,
    /// Total inserted lines across all changed files.
    pub insertions: u32,
    /// Total deleted lines across all changed files.
    pub deletions: u32,
    /// True when this commit has more than one parent, so the diff covers one side.
    pub is_merge: bool,
}

/// Bounds and selects the patch returned with commit change summaries.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DiffRequest {
    /// Commit whose changes are requested.
    pub commit_id: String,
    /// Changed path whose patch is requested; other files are summaries only.
    pub file_path: Option<String>,
    /// Path whose ordinary line and byte thresholds are bypassed, up to the hard cap.
    pub expand_path: Option<String>,
}

/// Reads a commit's diff against its first parent.
///
/// # Errors
///
/// Returns [`AppError`] when the repository cannot be opened, the commit id is
/// malformed or unknown, or libgit2 fails to produce the diff.
pub fn get_commit_diff(active: &ActiveRepo, request: &DiffRequest) -> Result<CommitDiff, AppError> {
    let repo = active.open()?;
    let oid = parse_commit_id(&request.commit_id)?;
    let commit = repo.find_commit(oid)?;

    let parent = commit.parents().next();
    let parent_tree = match parent.as_ref() {
        Some(parent) => Some(parent.tree()?),
        None => None,
    };

    let mut options = DiffOptions::new();
    options
        .include_typechange(true)
        .ignore_submodules(true)
        .context_lines(3);

    let mut diff = repo.diff_tree_to_tree(
        parent_tree.as_ref(),
        Some(&commit.tree()?),
        Some(&mut options),
    )?;
    ensure_file_count(diff.deltas().len())?;

    // Rename detection runs on the diff rather than during generation so a
    // pure rename reads as one entry instead of an unrelated add and delete.
    diff.find_similar(None)?;

    let totals = diff.stats()?;
    let files = collect_files(
        &diff,
        request.file_path.as_deref(),
        request.expand_path.as_deref(),
    )?;
    if request
        .file_path
        .as_ref()
        .is_some_and(|requested| !files.iter().any(|file| file.path == *requested))
    {
        return Err(AppError::InvalidInput(
            "requested path is not changed by this commit".to_owned(),
        ));
    }
    Ok(CommitDiff {
        commit_id: commit.id().to_string(),
        parent_id: parent.map(|parent| parent.id().to_string()),
        files,
        insertions: u32::try_from(totals.insertions()).unwrap_or(u32::MAX),
        deletions: u32::try_from(totals.deletions()).unwrap_or(u32::MAX),
        is_merge: commit.parent_count() > 1,
    })
}

fn ensure_file_count(file_count: usize) -> Result<(), AppError> {
    if file_count > MAX_COMMIT_DIFF_FILES {
        return Err(AppError::ResourceLimitExceeded(format!(
            "commit changes more than {MAX_COMMIT_DIFF_FILES} files"
        )));
    }
    Ok(())
}

pub(crate) fn collect_files(
    diff: &git2::Diff<'_>,
    patch_path: Option<&str>,
    expand_path: Option<&str>,
) -> Result<Vec<FileDiff>, AppError> {
    collect_files_internal(diff, patch_path, expand_path, None, true)
}

/// Collects file metadata without materializing patch text.
pub(crate) fn collect_summaries(diff: &git2::Diff<'_>) -> Result<Vec<FileDiffSummary>, AppError> {
    collect_files_internal(diff, None, None, None, false)
        .map(|files| files.iter().map(FileDiffSummary::from).collect::<Vec<_>>())
}

/// Collects one detailed file, keeping the expensive patch allocation out of
/// the initial worktree listing.
pub(crate) fn collect_file(
    diff: &git2::Diff<'_>,
    path: &str,
    expand: bool,
) -> Result<Option<FileDiff>, AppError> {
    let expanded = expand.then_some(path);
    collect_files_internal(diff, Some(path), expanded, Some(path), true)
        .map(|mut files| files.pop())
}

fn collect_files_internal(
    diff: &git2::Diff<'_>,
    patch_path: Option<&str>,
    expand_path: Option<&str>,
    only_path: Option<&str>,
    include_patch: bool,
) -> Result<Vec<FileDiff>, AppError> {
    let file_stats = if only_path.is_none() {
        Some(collect_file_stats(diff)?)
    } else {
        None
    };
    let mut files = Vec::new();

    for index in 0..diff.deltas().len() {
        let Some(delta) = diff.get_delta(index) else {
            continue;
        };
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default();

        if only_path.is_some_and(|requested| requested != path) {
            continue;
        }

        let old_path = delta
            .old_file()
            .path()
            .map(|old| old.to_string_lossy().into_owned())
            .filter(|old| *old != path);

        let mut requested_hunks = None;
        let stats = if let Some(file_stats) = &file_stats {
            file_stats.get(&path).copied().unwrap_or_default()
        } else {
            let hunks = git2::Patch::from_diff(diff, index)?;
            let (_, insertions, deletions) = hunks
                .as_ref()
                .map_or(Ok((0, 0, 0)), git2::Patch::line_stats)?;
            let patch_bytes = hunks
                .as_ref()
                .map_or(0, |hunks| hunks.size(true, true, true));
            requested_hunks = hunks;
            FileDiffStats {
                insertions: u32::try_from(insertions).unwrap_or(u32::MAX),
                deletions: u32::try_from(deletions).unwrap_or(u32::MAX),
                patch_bytes,
            }
        };
        let insertions = stats.insertions;
        let deletions = stats.deletions;

        let binary = delta.new_file().is_binary() || delta.old_file().is_binary();
        let lines = insertions.saturating_add(deletions);
        let patch_bytes = stats.patch_bytes;
        let expanded = expand_path == Some(path.as_str());
        let oversized =
            (lines > LARGE_DIFF_LINE_LIMIT || patch_bytes > MAX_INITIAL_DIFF_BYTES) && !expanded;
        let beyond_hard_limit = patch_bytes > MAX_COMMIT_DIFF_BYTES && expanded;
        let requested_patch = patch_path == Some(path.as_str());

        let omitted = if binary {
            Some(DiffOmission::Binary)
        } else if oversized || beyond_hard_limit {
            Some(DiffOmission::TooLarge)
        } else {
            None
        };

        let text = if omitted.is_none() && include_patch && requested_patch {
            let hunks = match requested_hunks {
                Some(hunks) => Some(hunks),
                None => git2::Patch::from_diff(diff, index)?,
            };
            match hunks {
                Some(mut hunks) => {
                    Some(String::from_utf8_lossy(hunks.to_buf()?.as_ref()).into_owned())
                }
                None => None,
            }
        } else {
            None
        };
        files.push(FileDiff {
            summary: FileDiffSummary {
                path,
                old_path,
                change: FileChange::from(delta.status()),
                insertions,
                deletions,
                omitted,
            },
            patch: text,
        });
    }

    Ok(files)
}

#[derive(Clone, Copy, Default)]
struct FileDiffStats {
    insertions: u32,
    deletions: u32,
    patch_bytes: usize,
}

fn collect_file_stats(diff: &git2::Diff<'_>) -> Result<HashMap<String, FileDiffStats>, AppError> {
    let mut stats: HashMap<String, FileDiffStats> = HashMap::new();
    for delta in diff.deltas() {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default();
        stats.entry(path).or_default();
    }

    diff.print(DiffFormat::Patch, |delta, _, line| {
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|path| path.to_string_lossy());
        if let Some(file_stats) = path.and_then(|path| stats.get_mut(path.as_ref())) {
            match line.origin() {
                '+' => file_stats.insertions = file_stats.insertions.saturating_add(1),
                '-' => file_stats.deletions = file_stats.deletions.saturating_add(1),
                _ => {}
            }
            let line_bytes = line.content().len().saturating_add(1);
            file_stats.patch_bytes = file_stats
                .patch_bytes
                .saturating_add(line_bytes)
                .min(MAX_COMMIT_DIFF_BYTES.saturating_add(1));
        }
        true
    })?;

    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::{ensure_file_count, FileChange, FileDiff, FileDiffSummary, MAX_COMMIT_DIFF_FILES};
    use crate::error::AppError;

    #[test]
    fn commit_file_count_is_bounded_before_rename_detection() {
        assert_eq!(ensure_file_count(MAX_COMMIT_DIFF_FILES), Ok(()));
        assert!(matches!(
            ensure_file_count(MAX_COMMIT_DIFF_FILES + 1),
            Err(AppError::ResourceLimitExceeded(_))
        ));
    }

    #[test]
    fn file_diff_flattens_its_shared_summary_on_the_wire() {
        let file = FileDiff {
            summary: FileDiffSummary {
                path: "src/main.rs".to_owned(),
                old_path: None,
                change: FileChange::Modified,
                insertions: 2,
                deletions: 1,
                omitted: None,
            },
            patch: Some("@@ -1 +1,2 @@".to_owned()),
        };

        assert_eq!(
            serde_json::to_value(file).unwrap(),
            serde_json::json!({
                "path": "src/main.rs",
                "old_path": null,
                "change": "Modified",
                "insertions": 2,
                "deletions": 1,
                "omitted": null,
                "patch": "@@ -1 +1,2 @@"
            })
        );
    }
}
