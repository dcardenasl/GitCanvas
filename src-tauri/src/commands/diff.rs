//! Diff commands. Like every command here, this is a translation layer: the
//! guards for binary content and oversized changes live in the domain crate.

use gitcanvas_core::{
    blob::{self, FileContent, FileContentRequest},
    diff::{self, CommitDiff, DiffRequest},
    error::AppError,
    repository::ActiveRepo,
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
        diff::get_commit_diff(&ActiveRepo::validate(path)?, &request)
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
        blob::get_file_content(&ActiveRepo::validate(path)?, &request)
    })
    .await
}
