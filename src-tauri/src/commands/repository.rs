//! Repository commands. Each request carries its repository identity so an older
//! in-flight request cannot accidentally read a newly selected repository.

use gitcanvas_core::{
    error::AppError,
    history::{HistoryPage, HistoryReader, HistoryRequest},
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
pub async fn get_commits(
    path: String,
    request: HistoryRequest,
    reader: tauri::State<'_, std::sync::Arc<HistoryReader>>,
) -> Result<HistoryPage, AppError> {
    let reader = std::sync::Arc::clone(reader.inner());
    blocking("get_commits", move || {
        reader.get_commits(&ActiveRepo::validate(path)?, &request)
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

/// The repository named on the command line, if the application was launched
/// with one.
///
/// `gitcanvas /path/to/repo` is what a terminal user expects of a Git client,
/// and it is also what lets the end-to-end suite open a repository without a
/// native file dialog.
///
/// Every argument is scanned rather than only the first: a launcher may put its
/// own flags ahead of the user's path, which is exactly what the WebDriver
/// harness does. The first argument that both looks like a path and validates
/// as a repository wins; an argument that is not one is skipped rather than
/// reported, because it probably belongs to the runtime.
///
/// `GITCANVAS_REPOSITORY` does the same thing for environments where passing
/// arguments is awkward.
#[tauri::command]
#[specta::specta]
pub async fn get_startup_repository() -> Result<Option<RepositoryInfo>, AppError> {
    blocking("get_startup_repository", || {
        let from_env = std::env::var("GITCANVAS_REPOSITORY").ok();
        let candidates = from_env
            .into_iter()
            .chain(std::env::args().skip(1))
            .filter(|argument| !argument.starts_with('-'));

        for candidate in candidates {
            if let Ok(repo) = ActiveRepo::validate(&candidate) {
                return repo.info().map(Some);
            }
        }
        Ok(None)
    })
    .await
}
