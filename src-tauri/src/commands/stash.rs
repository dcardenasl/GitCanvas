//! Authorized, bounded, read-only stash commands.

use super::{
    repo_access::{with_repo, AllowedRepos},
    runtime::read,
};
use gitcanvas_core::{
    error::AppError,
    stash::{
        self, StashFileContent, StashFileContentRequest, StashFileDiff, StashFileDiffRequest,
        StashFilesPage, StashFilesRequest, StashFingerprint, StashListRequest, StashPage,
    },
};

/// Reads bounded stash data through the canonical repository authorization boundary.
#[tauri::command]
#[specta::specta]
pub async fn get_stashes(
    path: String,
    request: StashListRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<StashPage, AppError> {
    let allowed = allowed.inner().clone();
    read("get_stashes", move || {
        with_repo(&allowed, &path, |active| {
            stash::get_stashes(active, &request)
        })
    })
    .await
}

/// Reads bounded stash data through the canonical repository authorization boundary.
#[tauri::command]
#[specta::specta]
pub async fn get_stash_files(
    path: String,
    request: StashFilesRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<StashFilesPage, AppError> {
    let allowed = allowed.inner().clone();
    read("get_stash_files", move || {
        with_repo(&allowed, &path, |active| {
            stash::get_stash_files(active, &request)
        })
    })
    .await
}

/// Reads bounded stash data through the canonical repository authorization boundary.
#[tauri::command]
#[specta::specta]
pub async fn get_stash_file_diff(
    path: String,
    request: StashFileDiffRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<StashFileDiff, AppError> {
    let allowed = allowed.inner().clone();
    read("get_stash_file_diff", move || {
        with_repo(&allowed, &path, |active| {
            stash::get_stash_file_diff(active, &request)
        })
    })
    .await
}

/// Reads bounded stash data through the canonical repository authorization boundary.
#[tauri::command]
#[specta::specta]
pub async fn get_stash_file_content(
    path: String,
    request: StashFileContentRequest,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<StashFileContent, AppError> {
    let allowed = allowed.inner().clone();
    read("get_stash_file_content", move || {
        with_repo(&allowed, &path, |active| {
            stash::get_stash_file_content(active, &request)
        })
    })
    .await
}

/// Reads a cheap stash metadata revision for active-project polling.
#[tauri::command]
#[specta::specta]
pub async fn get_stash_fingerprint(
    path: String,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<StashFingerprint, AppError> {
    let allowed = allowed.inner().clone();
    read("get_stash_fingerprint", move || {
        with_repo(&allowed, &path, stash::get_stash_fingerprint)
    })
    .await
}
