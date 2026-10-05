//! Diff commands. Like every command here, this is a translation layer: the
//! guards for binary content and oversized changes live in the domain crate.

use gitcanvas_core::{
    blob::{self, FileContent, FileContentRequest},
    commit_tree::{self, CommitTreePage, CommitTreeRequest},
    diff::{self, CommitDiff, DiffRequest},
    error::AppError,
    worktree::{
        self, WorktreeFileContent, WorktreeFileContentRequest, WorktreeFileDiff,
        WorktreeFileDiffRequest, WorktreeFingerprint, WorktreeSnapshot, WorktreeSnapshotRequest,
    },
};

use super::{
    repo_access::{with_repo, AllowedRepos},
    runtime::read,
};

/// Reads a commit's changes against its first parent.
///
/// `request.expand_path` opts one file out of the size guard, which is how the
/// interface loads a large diff only when the user asks for it.
#[tauri::command]
#[specta::specta]
pub async fn get_commit_diff(
    path: String,
    request: DiffRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<CommitDiff, AppError> {
    let allowed = allowed.inner().clone();
    read("get_commit_diff", move || {
        with_repo(&allowed, &path, |active| {
            diff::get_commit_diff(active, &request)
        })
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
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<FileContent, AppError> {
    let allowed = allowed.inner().clone();
    read("get_file_content", move || {
        with_repo(&allowed, &path, |active| {
            blob::get_file_content(active, &request)
        })
    })
    .await
}

/// Reads one bounded page of direct children from a commit directory.
#[tauri::command]
#[specta::specta]
pub async fn get_commit_tree_page(
    path: String,
    request: CommitTreeRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<CommitTreePage, AppError> {
    let allowed = allowed.inner().clone();
    read("get_commit_tree_page", move || {
        with_repo(&allowed, &path, |active| {
            commit_tree::get_commit_tree_page(active, &request)
        })
    })
    .await
}

/// Reads both local change sets with one repository revision.
#[tauri::command]
#[specta::specta]
pub async fn get_worktree_snapshot(
    path: String,
    request: WorktreeSnapshotRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<WorktreeSnapshot, AppError> {
    let allowed = allowed.inner().clone();
    read("get_worktree_snapshot", move || {
        with_repo(&allowed, &path, |active| {
            worktree::get_worktree_snapshot(active, &request)
        })
    })
    .await
}

/// Reads one staged or unstaged file diff on demand.
#[tauri::command]
#[specta::specta]
pub async fn get_worktree_file_diff(
    path: String,
    request: WorktreeFileDiffRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<WorktreeFileDiff, AppError> {
    let allowed = allowed.inner().clone();
    read("get_worktree_file_diff", move || {
        with_repo(&allowed, &path, |active| {
            worktree::get_worktree_file_diff(active, &request)
        })
    })
    .await
}

/// Reads a staged file from the index or an unstaged file from disk.
#[tauri::command]
#[specta::specta]
pub async fn get_worktree_file_content(
    path: String,
    request: WorktreeFileContentRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<WorktreeFileContent, AppError> {
    let allowed = allowed.inner().clone();
    read("get_worktree_file_content", move || {
        with_repo(&allowed, &path, |active| {
            worktree::get_worktree_file_content(active, &request)
        })
    })
    .await
}

/// Reads a cheap revision used when filesystem events are unavailable.
#[tauri::command]
#[specta::specta]
pub async fn get_worktree_fingerprint(
    path: String,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<WorktreeFingerprint, AppError> {
    let allowed = allowed.inner().clone();
    read("get_worktree_fingerprint", move || {
        with_repo(&allowed, &path, worktree::get_worktree_fingerprint)
    })
    .await
}
