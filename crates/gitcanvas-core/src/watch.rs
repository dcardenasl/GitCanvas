//! Native observation of repository metadata and the working tree.

use std::{
    path::{Path, PathBuf},
    sync::mpsc,
    thread::{self, JoinHandle},
    time::Duration,
};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::{error::AppError, repository::ActiveRepo};

const SETTLE: Duration = Duration::from_millis(250);
const INTERESTING_METADATA: [&str; 5] = ["HEAD", "refs", "packed-refs", "ORIG_HEAD", "MERGE_HEAD"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEvent {
    Changed(ChangeScope),
    Degraded(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeScope {
    Metadata,
    Worktree,
}

enum Message {
    Changed(ChangeScope),
    Degraded(String),
    Stop,
}

/// A live watch that owns both native subscriptions and its worker thread.
pub struct RepositoryWatcher {
    _watcher: RecommendedWatcher,
    stop: mpsc::Sender<Message>,
    worker: Option<JoinHandle<()>>,
}

impl Drop for RepositoryWatcher {
    fn drop(&mut self) {
        let _ = self.stop.send(Message::Stop);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn metadata_dir(active: &ActiveRepo) -> Result<PathBuf, AppError> {
    Ok(active.open()?.path().to_path_buf())
}

fn is_mutating(kind: EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

fn classify(event: &Event, metadata: &Path, worktree: &Path) -> Option<ChangeScope> {
    if !is_mutating(event.kind) {
        return None;
    }
    if event.paths.iter().any(|path| {
        path.starts_with(metadata) && path.file_name().is_some_and(|name| name == "index")
    }) {
        return Some(ChangeScope::Worktree);
    }
    if event.paths.iter().any(|path| {
        path.starts_with(metadata)
            && path.components().any(|component| {
                INTERESTING_METADATA
                    .iter()
                    .any(|name| component.as_os_str() == *name)
            })
    }) {
        return Some(ChangeScope::Metadata);
    }
    if event
        .paths
        .iter()
        .any(|path| path.starts_with(worktree) && !path.starts_with(metadata))
    {
        return Some(ChangeScope::Worktree);
    }
    None
}

/// Watches metadata and working-tree mutations, debounced into one event.
///
/// # Errors
///
/// Returns [`AppError::WatchDegraded`] when the platform cannot create or
/// attach the watcher to the validated repository paths.
pub fn watch_repository(
    active: &ActiveRepo,
    on_event: impl Fn(WatchEvent) + Send + 'static,
) -> Result<RepositoryWatcher, AppError> {
    let metadata = metadata_dir(active)?;
    let worktree = active.path().to_path_buf();
    let (message_tx, message_rx) = mpsc::channel::<Message>();
    let callback_tx = message_tx.clone();
    let callback_metadata = metadata.clone();
    let callback_worktree = worktree.clone();

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| match result {
            Ok(event) => {
                if let Some(scope) = classify(&event, &callback_metadata, &callback_worktree) {
                    let _ = callback_tx.send(Message::Changed(scope));
                }
            }
            Err(error) => {
                let _ = callback_tx.send(Message::Degraded(error.to_string()));
            }
        },
        Config::default().with_follow_symlinks(false),
    )
    .map_err(|error| AppError::WatchDegraded(format!("could not create watcher: {error}")))?;

    watcher
        .watch(&worktree, RecursiveMode::Recursive)
        .map_err(|error| AppError::WatchDegraded(format!("could not watch worktree: {error}")))?;
    if !metadata.starts_with(&worktree) {
        watcher
            .watch(&metadata, RecursiveMode::Recursive)
            .map_err(|error| {
                AppError::WatchDegraded(format!("could not watch metadata: {error}"))
            })?;
    }

    let worker = thread::spawn(move || {
        while let Ok(message) = message_rx.recv() {
            let mut pending = None;
            match message {
                Message::Stop => return,
                Message::Changed(scope) => pending = Some(scope),
                Message::Degraded(error) => on_event(WatchEvent::Degraded(error)),
            }

            loop {
                match message_rx.recv_timeout(SETTLE) {
                    Ok(Message::Changed(scope)) => {
                        pending = Some(match (pending, scope) {
                            (Some(ChangeScope::Metadata), _) | (_, ChangeScope::Metadata) => {
                                ChangeScope::Metadata
                            }
                            _ => ChangeScope::Worktree,
                        });
                    }
                    Ok(Message::Degraded(error)) => {
                        on_event(WatchEvent::Degraded(error));
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Ok(Message::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }

            if let Some(scope) = pending {
                on_event(WatchEvent::Changed(scope));
            }
        }
    });

    Ok(RepositoryWatcher {
        _watcher: watcher,
        stop: message_tx,
        worker: Some(worker),
    })
}
