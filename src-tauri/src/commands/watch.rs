//! Watching the open repository for changes.
//!
//! One watch at a time, held in application state: opening another repository
//! replaces it, and closing the window drops it. A watcher that outlives what
//! it was watching keeps invalidating caches for a window that has moved on.

use std::sync::Mutex;

use gitcanvas_core::{error::AppError, repository::ActiveRepo, watch};
use serde::{Deserialize, Serialize};
use specta::Type;

use super::repository::blocking;

/// Announces that the open repository changed on disk.
///
/// Carries no detail on purpose: what changed is not something the interface
/// acts on differently, and a payload describing it would be a second source
/// of truth next to the queries it triggers.
#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct RepositoryChangedEvent {
    pub path: String,
}

/// The single live watch, replaced whenever a repository is opened.
#[derive(Default)]
pub struct ActiveWatch(pub Mutex<Option<watch::RepositoryWatcher>>);

/// Publishes repository changes to the interface.
#[derive(Clone)]
pub struct ChangeNotifier(pub std::sync::Arc<dyn Fn(String) + Send + Sync>);

/// Starts watching a repository, replacing any previous watch.
///
/// Idempotent from the interface's point of view: calling it again for the
/// same repository simply re-establishes the watch.
#[tauri::command]
#[specta::specta]
pub async fn watch_repository(
    path: String,
    current: tauri::State<'_, ActiveWatch>,
    notifier: tauri::State<'_, ChangeNotifier>,
) -> Result<(), AppError> {
    let publish = std::sync::Arc::clone(&notifier.0);
    let reported_path = path.clone();

    let watcher = blocking("watch_repository", move || {
        let active = ActiveRepo::validate(&path)?;
        watch::watch_repository(&active, move || publish(reported_path.clone()))
    })
    .await?;

    // The previous watcher is dropped here, which stops it.
    match current.0.lock() {
        Ok(mut slot) => *slot = Some(watcher),
        Err(_) => {
            return Err(AppError::Internal(
                "the watch state was left poisoned by an earlier failure".to_owned(),
            ))
        }
    }

    Ok(())
}

/// Stops watching, if anything was being watched.
#[tauri::command]
#[specta::specta]
pub async fn unwatch_repository(current: tauri::State<'_, ActiveWatch>) -> Result<(), AppError> {
    if let Ok(mut slot) = current.0.lock() {
        *slot = None;
    }
    Ok(())
}
