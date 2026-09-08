//! First-parent commit diffs, with explicit guards for content that must not
//! be rendered as text.
//!
//! Merge commits are diffed against their first parent only. A combined diff
//! is a materially harder problem and is documented as a known limitation
//! rather than approximated: showing a merge's changes against one side while
//! implying it covers both would be worse than not showing them.

use git2::{Delta, DiffOptions, Oid};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{error::AppError, repository::ActiveRepo};

/// Lines above which a file's hunks are withheld until explicitly requested.
///
/// A generated bundle can be hundreds of thousands of lines; rendering that
/// eagerly stalls the interface for something nobody reads.
pub const LARGE_DIFF_LINE_LIMIT: u32 = 2_000;

/// How a path changed between two trees.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum FileChange {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
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
    pub path: String,
    /// Previous path for renames and copies.
    pub old_path: Option<String>,
    pub change: FileChange,
    pub insertions: u32,
    pub deletions: u32,
    pub omitted: Option<DiffOmission>,
    /// Unified patch text for this file alone, ready for a diff renderer.
    pub patch: Option<String>,
}

/// A commit's changes against its first parent.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CommitDiff {
    pub commit_id: String,
    /// The parent compared against; absent for a root commit.
    pub parent_id: Option<String>,
    pub files: Vec<FileDiff>,
    pub insertions: u32,
    pub deletions: u32,
    /// True when this commit has more than one parent, so the diff covers one side.
    pub is_merge: bool,
}

/// Which file, if any, the caller wants in full regardless of its size.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DiffRequest {
    pub commit_id: String,
    /// Path to include in full even if it exceeds the size guard.
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
    let oid = Oid::from_str(&request.commit_id)
        .map_err(|_| AppError::InvalidInput("commit id is not a valid object id".to_owned()))?;
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
    // Rename detection runs on the diff rather than during generation so a
    // pure rename reads as one entry instead of an unrelated add and delete.
    diff.find_similar(None)?;

    let files = collect_files(&diff, request.expand_path.as_deref())?;
    let insertions = files.iter().map(|file| file.insertions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();

    Ok(CommitDiff {
        commit_id: commit.id().to_string(),
        parent_id: parent.map(|parent| parent.id().to_string()),
        files,
        insertions,
        deletions,
        is_merge: commit.parent_count() > 1,
    })
}

fn collect_files(
    diff: &git2::Diff<'_>,
    expand_path: Option<&str>,
) -> Result<Vec<FileDiff>, AppError> {
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

        let old_path = delta
            .old_file()
            .path()
            .map(|old| old.to_string_lossy().into_owned())
            .filter(|old| *old != path);

        let hunks = git2::Patch::from_diff(diff, index)?;
        let (_, insertions, deletions) = hunks
            .as_ref()
            .map_or(Ok((0, 0, 0)), git2::Patch::line_stats)?;

        let binary = delta.new_file().is_binary() || delta.old_file().is_binary();
        let lines = u32::try_from(insertions + deletions).unwrap_or(u32::MAX);
        let oversized = lines > LARGE_DIFF_LINE_LIMIT && expand_path != Some(path.as_str());

        let omitted = if binary {
            Some(DiffOmission::Binary)
        } else if oversized {
            Some(DiffOmission::TooLarge)
        } else {
            None
        };

        let text = match (omitted, hunks) {
            (None, Some(mut hunks)) => {
                Some(String::from_utf8_lossy(hunks.to_buf()?.as_ref()).into_owned())
            }
            _ => None,
        };
        files.push(FileDiff {
            path,
            old_path,
            change: FileChange::from(delta.status()),
            insertions: u32::try_from(insertions).unwrap_or(u32::MAX),
            deletions: u32::try_from(deletions).unwrap_or(u32::MAX),
            omitted,
            patch: text,
        });
    }

    Ok(files)
}
