//! Repository commands. Each request carries its repository identity so an older
//! in-flight request cannot accidentally read a newly selected repository.

use gitcanvas_core::{
    error::AppError,
    history::{self, HistoryPage, HistoryRequest},
    refs::{self, BranchInfo, TagInfo},
    repository::{ActiveRepo, RepositoryInfo},
};

/// Runs blocking domain work away from the event loop and translates join errors.
pub(crate) async fn blocking<T: Send + 'static>(
    operation: &'static str,
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let result = work();
        tracing::info!(operation, elapsed_ms = %start.elapsed().as_millis(), success = result.is_ok(), "domain operation completed");
        result
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}

/// Validates and opens a local repository, returning its canonical identity.
#[tauri::command]
#[specta::specta]
pub async fn open_repository(path: String) -> Result<RepositoryInfo, AppError> {
    blocking("open_repository", move || {
        ActiveRepo::validate(path)?.info()
    })
    .await
}

/// Checks a candidate working-tree root without changing application selection.
#[tauri::command]
#[specta::specta]
pub async fn validate_repository(path: String) -> Result<RepositoryInfo, AppError> {
    blocking("validate_repository", move || {
        ActiveRepo::validate(path)?.info()
    })
    .await
}

/// Reads a bounded history page using the selected repository's canonical path.
#[tauri::command]
#[specta::specta]
pub async fn get_commits(path: String, request: HistoryRequest) -> Result<HistoryPage, AppError> {
    blocking("get_commits", move || {
        history::get_commits(&ActiveRepo::validate(path)?, &request)
    })
    .await
}

/// Lists local and remote branches and identifies the current branch.
#[tauri::command]
#[specta::specta]
pub async fn get_branches(path: String) -> Result<Vec<BranchInfo>, AppError> {
    blocking("get_branches", move || {
        refs::get_branches(&ActiveRepo::validate(path)?)
    })
    .await
}

/// Lists tags, peeling annotated tags to commits when applicable.
#[tauri::command]
#[specta::specta]
pub async fn get_tags(path: String) -> Result<Vec<TagInfo>, AppError> {
    blocking("get_tags", move || {
        refs::get_tags(&ActiveRepo::validate(path)?)
    })
    .await
}
