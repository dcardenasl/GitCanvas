//! Native observation of repository metadata and the working tree.

use std::{
    collections::BTreeSet,
    path::PathBuf,
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

fn metadata_dirs(active: &ActiveRepo) -> Result<Vec<PathBuf>, AppError> {
    let repo = active.open()?;
    Ok(
        BTreeSet::from([repo.path().to_path_buf(), repo.commondir().to_path_buf()])
            .into_iter()
            .collect(),
    )
}

fn is_mutating(kind: EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

fn classify(event: &Event, metadata: &[PathBuf]) -> Option<ChangeScope> {
    if !is_mutating(event.kind) {
        return None;
    }
    if event.paths.iter().any(|path| {
        metadata.iter().any(|metadata| path.starts_with(metadata))
            && path
                .file_name()
                .is_some_and(|name| name == "index" || name == "index.lock")
    }) {
        return Some(ChangeScope::Worktree);
    }
    if event.paths.iter().any(|path| {
        metadata.iter().any(|metadata| path.starts_with(metadata))
            && path.components().any(|component| {
                INTERESTING_METADATA
                    .iter()
                    .any(|name| component.as_os_str() == *name)
            })
    }) {
        return Some(ChangeScope::Metadata);
    }
    None
}

/// Watches Git metadata, debounced into one event.
///
/// Working-tree content is intentionally not watched through a recursive
/// filesystem subscription. Its revision is polled from Git status instead,
/// which keeps the watcher independent of repository size and layout.
///
/// # Errors
///
/// Returns [`AppError::WatchDegraded`] when the platform cannot create or
/// attach the watcher to the validated repository paths.
pub fn watch_repository(
    active: &ActiveRepo,
    on_event: impl Fn(WatchEvent) + Send + 'static,
) -> Result<RepositoryWatcher, AppError> {
    let metadata = metadata_dirs(active)?;
    let (message_tx, message_rx) = mpsc::channel::<Message>();
    let callback_tx = message_tx.clone();
    let callback_metadata = metadata.clone();

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| match result {
            Ok(event) => {
                if let Some(scope) = classify(&event, &callback_metadata) {
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

    for directory in &metadata {
        watcher
            .watch(directory, RecursiveMode::NonRecursive)
            .map_err(|error| {
                AppError::WatchDegraded(format!("could not watch metadata: {error}"))
            })?;
    }
    for directory in &metadata {
        let refs = directory.join("refs");
        if refs.is_dir() {
            watcher
                .watch(&refs, RecursiveMode::Recursive)
                .map_err(|error| {
                    AppError::WatchDegraded(format!("could not watch refs: {error}"))
                })?;
        }
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
