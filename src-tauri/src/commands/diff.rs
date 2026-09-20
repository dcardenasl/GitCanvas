//! Diff commands. Like every command here, this is a translation layer: the
//! guards for binary content and oversized changes live in the domain crate.

use gitcanvas_core::{
    blob::{self, FileContent, FileContentRequest},
    commit_tree::{self, CommitTreePage, CommitTreeRequest},
    diff::{self, CommitDiff, DiffRequest},
    error::AppError,
    repository::ActiveRepo,
    worktree::{
        self, WorktreeFileContent, WorktreeFileContentRequest, WorktreeFileDiff,
        WorktreeFileDiffRequest, WorktreeFingerprint, WorktreeSnapshot, WorktreeSnapshotRequest,
    },
};

use super::repository::blocking;

/// Reads a commit's changes against its first parent.
///
/// `request.expand_path` opts one file out of the size guard, which is how the
/// interface loads a large diff only when the user asks for it.
#[tauri::command]
#[specta::specta]
pub async fn get_commit_diff(path: String, request: DiffRequest) -> Result<CommitDiff, AppError> {
    blocking("get_commit_diff", move || {
        diff::get_commit_diff(&ActiveRepo::validate(&path)?, &request)
    })
    .await
}

/// Reads a file's full contents as it stands at a commit.
///
/// Complements the diff: a change only shows what moved, and reading the file
/// around it is often what answers the question.
#[tauri::command]
#[specta::specta]
pub async fn get_file_content(
    path: String,
    request: FileContentRequest,
) -> Result<FileContent, AppError> {
    blocking("get_file_content", move || {
        blob::get_file_content(&ActiveRepo::validate(&path)?, &request)
    })
    .await
}

/// Reads one bounded page of direct children from a commit directory.
#[tauri::command]
#[specta::specta]
pub async fn get_commit_tree_page(
    path: String,
    request: CommitTreeRequest,
) -> Result<CommitTreePage, AppError> {
    blocking("get_commit_tree_page", move || {
        commit_tree::get_commit_tree_page(&ActiveRepo::validate(&path)?, &request)
    })
    .await
}

/// Reads both local change sets with one repository revision.
#[tauri::command]
#[specta::specta]
pub async fn get_worktree_snapshot(
    path: String,
    request: WorktreeSnapshotRequest,
) -> Result<WorktreeSnapshot, AppError> {
    blocking("get_worktree_snapshot", move || {
        worktree::get_worktree_snapshot(&ActiveRepo::validate(&path)?, &request)
    })
    .await
}

/// Reads one staged or unstaged file diff on demand.
#[tauri::command]
#[specta::specta]
pub async fn get_worktree_file_diff(
    path: String,
    request: WorktreeFileDiffRequest,
) -> Result<WorktreeFileDiff, AppError> {
    blocking("get_worktree_file_diff", move || {
        worktree::get_worktree_file_diff(&ActiveRepo::validate(&path)?, &request)
    })
    .await
}

/// Reads a staged file from the index or an unstaged file from disk.
#[tauri::command]
#[specta::specta]
pub async fn get_worktree_file_content(
    path: String,
    request: WorktreeFileContentRequest,
) -> Result<WorktreeFileContent, AppError> {
    blocking("get_worktree_file_content", move || {
        worktree::get_worktree_file_content(&ActiveRepo::validate(&path)?, &request)
    })
    .await
}

/// Reads a cheap revision used when filesystem events are unavailable.
#[tauri::command]
#[specta::specta]
pub async fn get_worktree_fingerprint(path: String) -> Result<WorktreeFingerprint, AppError> {
    blocking("get_worktree_fingerprint", move || {
        worktree::get_worktree_fingerprint(&ActiveRepo::validate(&path)?)
    })
    .await
}
