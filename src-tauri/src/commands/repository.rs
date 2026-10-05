//! Repository commands. Every request resolves its explicit path through the
//! process-local allowlist; commands never depend on a mutable selected-repository
//! slot that could change while an operation is in flight.

use gitcanvas_core::{
    error::AppError,
    github::cache,
    history::{HistoryPage, HistoryReader, HistoryRequest},
    refs::{self, BranchInfo, TagInfo},
    repository::{ActiveRepo, RepositoryInfo},
};

use super::{
    github::CacheRoot,
    repo_access::{with_repo, AllowedRepos},
    runtime::read,
};

/// Validates and opens a local repository, returning its canonical identity.
#[tauri::command]
#[specta::specta]
pub async fn open_repository(
    path: String,
    cache: tauri::State<'_, CacheRoot>,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<RepositoryInfo, AppError> {
    let cache_root = cache.0.clone();
    let allowed = allowed.inner().clone();
    read("open_repository", move || {
        let active = ActiveRepo::validate(&path)?;
        let info = active.info()?;
        allowed.allow(&active)?;
        // Opening a cached clone counts as using it, which is what keeps the
        // retention policy from evicting a clone that is in regular use.
        let _recorded = cache::touch_if_cached(&cache_root, active.path());
        Ok(info)
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
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<HistoryPage, AppError> {
    let reader = std::sync::Arc::clone(reader.inner());
    let allowed = allowed.inner().clone();
    read("get_commits", move || {
        with_repo(&allowed, &path, |active| {
            reader.get_commits(active, &request)
        })
    })
    .await
}

/// Lists local and remote branches and identifies the current branch.
#[tauri::command]
#[specta::specta]
pub async fn get_branches(
    path: String,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<Vec<BranchInfo>, AppError> {
    let allowed = allowed.inner().clone();
    read("get_branches", move || {
        with_repo(&allowed, &path, refs::get_branches)
    })
    .await
}

/// Lists tags, peeling annotated tags to commits when applicable.
#[tauri::command]
#[specta::specta]
pub async fn get_tags(
    path: String,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<Vec<TagInfo>, AppError> {
    let allowed = allowed.inner().clone();
    read("get_tags", move || {
        with_repo(&allowed, &path, refs::get_tags)
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
pub async fn get_startup_repository(
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<Option<RepositoryInfo>, AppError> {
    let allowed = allowed.inner().clone();
    read("get_startup_repository", move || {
        let from_env = std::env::var("GITCANVAS_REPOSITORY").ok();
        let candidates = from_env
            .into_iter()
            .chain(std::env::args().skip(1))
            .filter(|argument| !argument.starts_with('-'));

        for candidate in candidates {
            if let Ok(repo) = ActiveRepo::validate(&candidate) {
                let info = repo.info()?;
                allowed.allow(&repo)?;
                return Ok(Some(info));
            }
        }
        Ok(None)
    })
    .await
}
