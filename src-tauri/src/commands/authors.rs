//! Authorized, bounded read commands for repository authors.

use super::{
    repo_access::{with_repo, AllowedRepos},
    runtime::read,
};
use gitcanvas_core::{
    authors::{
        self, AuthorCatalogChunk, AuthorCatalogRequest, AuthorCommitIdsPage, AuthorCommitIdsRequest,
    },
    error::AppError,
    history::HistoryReader,
};
use std::sync::Arc;

/// Reads one bounded delta from the repository's complete author catalog.
#[tauri::command]
#[specta::specta]
pub async fn get_author_catalog_chunk(
    path: String,
    request: AuthorCatalogRequest,
    reader: tauri::State<'_, Arc<HistoryReader>>,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<AuthorCatalogChunk, AppError> {
    let reader = Arc::clone(reader.inner());
    let allowed = allowed.inner().clone();
    read("get_author_catalog_chunk", move || {
        with_repo(&allowed, &path, |active| {
            authors::get_author_catalog_chunk(active, &request, &reader)
        })
    })
    .await
}

/// Reads one bounded page of commit IDs attributed to an author.
#[tauri::command]
#[specta::specta]
pub async fn get_author_commit_ids(
    path: String,
    request: AuthorCommitIdsRequest,
    reader: tauri::State<'_, Arc<HistoryReader>>,
    allowed: tauri::State<'_, AllowedRepos>,
) -> Result<AuthorCommitIdsPage, AppError> {
    let reader = Arc::clone(reader.inner());
    let allowed = allowed.inner().clone();
    read("get_author_commit_ids", move || {
        with_repo(&allowed, &path, |active| {
            authors::get_author_commit_ids(active, &request, &reader)
        })
    })
    .await
}
