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

use super::runtime::{read, write};

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

fn request_generation(current: &ActiveWatch, generation: u32) -> bool {
    current
        .desired_generation
        .fetch_max(generation, Ordering::SeqCst)
        <= generation
}

fn invalidate_generation(current: &ActiveWatch, generation: u32) -> bool {
    current
        .desired_generation
        .compare_exchange(
            generation,
            generation.wrapping_add(1),
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_ok()
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
    if !request_generation(&current, request.generation) {
        return Ok(());
    }
    let previous = current
        .active
        .lock()
        .map_err(|_| {
            AppError::Internal("the watch state was left poisoned by an earlier failure".to_owned())
        })?
        .take();
    if let Some(previous) = previous {
        write("drop_repository_watcher", move || {
            drop(previous);
            Ok(())
        })
        .await?;
    }

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
    let mut pending = Some(watcher);
    let (replaced, poisoned) = match current.active.lock() {
        Ok(mut slot) if current.desired_generation.load(Ordering::SeqCst) == generation => (
            pending
                .take()
                .and_then(|watcher| slot.replace((generation, watcher))),
            false,
        ),
        Ok(_) => (None, false),
        Err(_) => (None, true),
    };
    if poisoned {
        if let Some(watcher) = pending.take() {
            write("drop_stale_repository_watcher", move || {
                drop(watcher);
                Ok(())
            })
            .await?;
        }
        return Err(AppError::Internal(
            "the watch state was left poisoned by an earlier failure".to_owned(),
        ));
    }
    if let Some(watcher) = pending {
        write("drop_stale_repository_watcher", move || {
            drop(watcher);
            Ok(())
        })
        .await?;
    }
    if let Some(replaced) = replaced {
        write("drop_replaced_repository_watcher", move || {
            drop(replaced);
            Ok(())
        })
        .await?;
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
    if !invalidate_generation(&current, generation) {
        return Ok(());
    }
    let previous = {
        let mut slot = current.active.lock().map_err(|_| {
            AppError::Internal("the watch state was left poisoned by an earlier failure".to_owned())
        })?;
        if slot
            .as_ref()
            .is_some_and(|(active, _)| *active == generation)
        {
            slot.take()
        } else {
            None
        }
    };
    if let Some(previous) = previous {
        write("drop_repository_watcher", move || {
            drop(previous);
            Ok(())
        })
        .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{invalidate_generation, request_generation, ActiveWatch};
    use std::sync::{atomic::Ordering, Arc, Barrier};

    #[test]
    fn older_repository_start_and_unwatch_cannot_replace_a_newer_generation() {
        let current = ActiveWatch::default();

        assert!(request_generation(&current, 10));
        assert!(request_generation(&current, 11));
        assert!(!request_generation(&current, 10));
        assert!(!invalidate_generation(&current, 10));
        assert_eq!(current.desired_generation.load(Ordering::SeqCst), 11);
    }

    #[test]
    fn unwatch_invalidates_a_pending_start_for_its_generation() {
        let current = ActiveWatch::default();

        assert!(request_generation(&current, 20));
        assert!(invalidate_generation(&current, 20));
        assert!(!request_generation(&current, 20));
        assert!(request_generation(&current, 21));
    }

    #[test]
    fn concurrent_repository_change_and_unwatch_preserve_the_newer_generation() {
        let current = Arc::new(ActiveWatch::default());
        assert!(request_generation(&current, 30));
        let barrier = Arc::new(Barrier::new(3));
        let changed = {
            let current = Arc::clone(&current);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                request_generation(&current, 31)
            })
        };
        let stopped = {
            let current = Arc::clone(&current);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                invalidate_generation(&current, 30)
            })
        };
        barrier.wait();

        let _ = changed.join().unwrap();
        let _ = stopped.join().unwrap();
        assert_eq!(current.desired_generation.load(Ordering::SeqCst), 31);
    }
}
