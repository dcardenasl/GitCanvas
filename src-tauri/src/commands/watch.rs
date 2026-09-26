//! Watching the open repository for changes.
//!
//! One watch at a time, held in application state: opening another repository
//! replaces it, and closing the window drops it. A watcher that outlives what
//! it was watching keeps invalidating caches for a window that has moved on.

use std::sync::{
    atomic::{AtomicU32, Ordering},
    Mutex,
};

use gitcanvas_core::{error::AppError, repository::ActiveRepo, watch};
use serde::{Deserialize, Serialize};
use specta::Type;

use super::runtime::read;

/// Announces a scoped change in the generation currently shown by the window.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum RepositoryChangedKind {
    Metadata,
    Worktree,
    Degraded { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct RepositoryChangedEvent {
    pub path: String,
    pub generation: u32,
    pub kind: RepositoryChangedKind,
}

/// The single live watch, replaced whenever a repository is opened.
pub struct ActiveWatch {
    desired_generation: AtomicU32,
    active: Mutex<Option<(u32, watch::RepositoryWatcher)>>,
}

impl Default for ActiveWatch {
    fn default() -> Self {
        Self {
            desired_generation: AtomicU32::new(0),
            active: Mutex::new(None),
        }
    }
}

/// Publishes repository changes to the interface.
#[derive(Clone)]
pub struct ChangeNotifier(pub std::sync::Arc<dyn Fn(RepositoryChangedEvent) + Send + Sync>);

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct WatchRequest {
    pub path: String,
    pub generation: u32,
}

/// Starts watching a repository, replacing any previous watch.
///
/// Idempotent from the interface's point of view: calling it again for the
/// same repository simply re-establishes the watch.
#[tauri::command]
#[specta::specta]
pub async fn watch_repository(
    request: WatchRequest,
    current: tauri::State<'_, ActiveWatch>,
    notifier: tauri::State<'_, ChangeNotifier>,
) -> Result<(), AppError> {
    current
        .desired_generation
        .store(request.generation, Ordering::SeqCst);
    let previous = current
        .active
        .lock()
        .map_err(|_| {
            AppError::Internal("the watch state was left poisoned by an earlier failure".to_owned())
        })?
        .take();
    drop(previous);

    let publish = std::sync::Arc::clone(&notifier.0);
    let reported_path = request.path.clone();
    let generation = request.generation;

    let watcher = read("watch_repository", move || {
        let active = ActiveRepo::validate(&request.path)?;
        let publish = publish.clone();
        let reported_path = reported_path.clone();
        watch::watch_repository(&active, move |event| {
            let kind = match event {
                watch::WatchEvent::Changed(watch::ChangeScope::Metadata) => {
                    RepositoryChangedKind::Metadata
                }
                watch::WatchEvent::Changed(watch::ChangeScope::Worktree) => {
                    RepositoryChangedKind::Worktree
                }
                watch::WatchEvent::Degraded(message) => RepositoryChangedKind::Degraded { message },
            };
            publish(RepositoryChangedEvent {
                path: reported_path.clone(),
                generation,
                kind,
            });
        })
    })
    .await;

    let watcher = watcher?;

    // An older asynchronous start must never replace a newer repository watch.
    match current.active.lock() {
        Ok(mut slot) if current.desired_generation.load(Ordering::SeqCst) == generation => {
            *slot = Some((generation, watcher));
        }
        Ok(_) => drop(watcher),
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
pub async fn unwatch_repository(
    generation: u32,
    current: tauri::State<'_, ActiveWatch>,
) -> Result<(), AppError> {
    if current.desired_generation.load(Ordering::SeqCst) == generation {
        let mut slot = current.active.lock().map_err(|_| {
            AppError::Internal("the watch state was left poisoned by an earlier failure".to_owned())
        })?;
        if slot
            .as_ref()
            .is_some_and(|(active, _)| *active == generation)
        {
            *slot = None;
        }
    }
    Ok(())
}
