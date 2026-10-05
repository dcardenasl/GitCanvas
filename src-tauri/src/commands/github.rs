//! GitHub commands.
//!
//! The token is written here and never read back out: `store_token` takes one,
//! `has_token` reports whether one exists, and nothing returns it. Everything
//! that needs the secret uses it inside `gitcanvas_core`.

use gitcanvas_core::{
    error::AppError,
    github::{
        api::{GitHubAccount, GitHubClient, GitHubRepositoryList},
        cache::{self, CacheStatus},
        clone, credentials,
    },
    repository::ActiveRepo,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{path::PathBuf, sync::Arc};

use super::{
    repo_access::AllowedRepos,
    runtime::{read, write},
};

/// Progress for an in-flight clone, emitted as it advances.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct CloneProgressEvent {
    pub full_name: String,
    pub received_objects: u32,
    pub total_objects: u32,
    pub received_bytes: String,
}

/// Where cached clones live: inside the application's own data directory, never
/// in a folder the user manages. Resolved once at startup and injected, so the
/// commands stay free of `AppHandle` and therefore of the runtime type.
pub struct CacheRoot(pub PathBuf);

/// Publishes clone progress to the interface.
///
/// A boxed callback rather than an `AppHandle`, so this layer does not need to
/// know how events are delivered — and so every command here stays generic-free
/// and can be collected by the typed builder.
#[derive(Clone)]
pub struct ProgressEmitter(pub Arc<dyn Fn(CloneProgressEvent) + Send + Sync>);

/// Stores a personal access token in the OS keychain.
#[tauri::command]
#[specta::specta]
pub async fn store_github_token(token: String) -> Result<GitHubAccount, AppError> {
    write("store_github_token", move || {
        // Verified before it is stored, so a token that cannot work never
        // becomes the reason a later clone fails for no visible reason.
        let account = GitHubClient::new(token.clone()).verify()?;
        credentials::store_token(&token)?;
        Ok(account)
    })
    .await
}

/// Reports whether a token is stored, without revealing it.
#[tauri::command]
#[specta::specta]
pub async fn has_github_token() -> Result<bool, AppError> {
    read("has_github_token", || Ok(credentials::has_token())).await
}

/// Removes the stored token.
#[tauri::command]
#[specta::specta]
pub async fn forget_github_token() -> Result<(), AppError> {
    write("forget_github_token", credentials::delete_token).await
}

/// Lists the repositories the stored token can reach.
#[tauri::command]
#[specta::specta]
pub async fn list_github_repositories() -> Result<GitHubRepositoryList, AppError> {
    read("list_github_repositories", || {
        GitHubClient::from_stored_token()?.list_repositories()
    })
    .await
}

/// Clones a repository into the application cache, emitting progress as it goes.
#[tauri::command]
#[specta::specta]
pub async fn clone_github_repository(
    clone_url: String,
    full_name: String,
    active_repository_path: Option<String>,
    allowed: tauri::State<'_, AllowedRepos>,
    root: tauri::State<'_, CacheRoot>,
    emitter: tauri::State<'_, ProgressEmitter>,
) -> Result<clone::ClonedRepository, AppError> {
    let destination = root.0.clone();
    let publish = Arc::clone(&emitter.0);
    let allowed = allowed.inner().clone();
    // Validated before any work starts, so a malformed name fails here rather
    // than after the transfer.
    let entry = clone::cache_entry_name(&full_name)?;
    let active_entry = active_repository_path
        .as_deref()
        .and_then(|path| cache::cached_entry_name(&destination, std::path::Path::new(path)));

    let cloned = write("clone_github_repository", move || {
        let cloned = clone::clone_repository(&clone_url, &full_name, &destination, |progress| {
            publish(CloneProgressEvent {
                full_name: full_name.clone(),
                received_objects: progress.received_objects,
                total_objects: progress.total_objects,
                received_bytes: progress.received_bytes.to_string(),
            });
        })?;
        allowed.allow(&ActiveRepo::validate(&cloned.path)?)?;
        Ok(cloned)
    })
    .await?;

    // Keep both the new clone and the currently open cache entry. A retention
    // failure must not turn a completed clone into an apparent clone failure.
    let destination = root.0.clone();
    write("enforce_cache_retention", move || {
        let mut keep = vec![entry];
        if let Some(active_entry) = active_entry {
            if !keep.contains(&active_entry) {
                keep.push(active_entry);
            }
        }
        cache::enforce_retention(&destination, &keep)
    })
    .await
    .unwrap_or_else(|error| {
        tracing::warn!(%error, "could not enforce clone cache retention");
        Vec::new()
    });

    Ok(cloned)
}

/// Reports what the clone cache holds and the limits it is held to.
#[tauri::command]
#[specta::specta]
pub async fn get_clone_cache_status(
    root: tauri::State<'_, CacheRoot>,
) -> Result<CacheStatus, AppError> {
    let destination = root.0.clone();
    read("get_clone_cache_status", move || {
        cache::status(&destination)
    })
    .await
}
