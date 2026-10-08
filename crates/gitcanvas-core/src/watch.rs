//! Native observation of repository metadata and the working tree.

use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    sync::mpsc,
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::{
    error::{is_descriptor_exhaustion, AppError},
    repository::ActiveRepo,
    retry::retry_transient,
};

const SETTLE: Duration = Duration::from_millis(250);
// A continuous stream of metadata events must not postpone refresh indefinitely.
const MAX_DEBOUNCE: Duration = Duration::from_secs(2);
const WATCH_RETRIES: u32 = 3;
const WATCH_BACKOFF: Duration = Duration::from_millis(100);
const INTERESTING_METADATA: [&str; 5] = ["HEAD", "refs", "packed-refs", "ORIG_HEAD", "MERGE_HEAD"];

/// Notification emitted when watched repository state changes or degrades.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEvent {
    /// Repository metadata or worktree content changed.
    Changed(ChangeScope),
    /// Watching could not continue; polling may be required.
    Degraded(String),
}

/// Scope of a repository change notification.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeScope {
    /// Refs, branches, tags, or other history metadata changed.
    Metadata,
    /// The index changed; worktree content should be refreshed.
    Worktree,
}

enum Message {
    Changed(ChangeScope),
    Degraded(String),
    Stop,
}

fn merge_scope(pending: ChangeScope, next: ChangeScope) -> ChangeScope {
    match (pending, next) {
        (ChangeScope::Metadata, _) | (_, ChangeScope::Metadata) => ChangeScope::Metadata,
        _ => ChangeScope::Worktree,
    }
}

fn debounce_expired(first: Instant, last: Instant, now: Instant) -> bool {
    now.duration_since(last) >= SETTLE || now.duration_since(first) >= MAX_DEBOUNCE
}

fn debounce_wait(first: Instant, last: Instant, now: Instant) -> Duration {
    SETTLE
        .saturating_sub(now.duration_since(last))
        .min(MAX_DEBOUNCE.saturating_sub(now.duration_since(first)))
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
        metadata
            .iter()
            .filter_map(|root| path.strip_prefix(root).ok())
            .any(|relative| {
                relative
                    .file_name()
                    .is_some_and(|name| name == "index" || name == "index.lock")
            })
    }) {
        return Some(ChangeScope::Worktree);
    }
    if event.paths.iter().any(|path| {
        metadata
            .iter()
            .filter_map(|root| path.strip_prefix(root).ok())
            .any(|relative| {
                relative.components().any(|component| {
                    INTERESTING_METADATA
                        .iter()
                        .any(|name| component.as_os_str() == *name)
                })
            })
    }) {
        return Some(ChangeScope::Metadata);
    }
    None
}

/// Subscribes `watcher` to `path`, retrying while the process is out of
/// descriptors: each native subscription holds one, and they are released as
/// other work finishes.
fn subscribe(
    watcher: &mut RecommendedWatcher,
    path: &Path,
    mode: RecursiveMode,
    what: &str,
) -> Result<(), AppError> {
    retry_transient(WATCH_RETRIES, WATCH_BACKOFF, || {
        watcher
            .watch(path, mode)
            .map_err(|error| match &error.kind {
                notify::ErrorKind::Io(io) if is_descriptor_exhaustion(io) => {
                    AppError::ResourceExhausted(error.to_string())
                }
                _ => AppError::WatchDegraded(format!("could not watch {what}: {error}")),
            })
    })
    .map_err(|error| match error {
        AppError::ResourceExhausted(message) => {
            AppError::WatchDegraded(format!("could not watch {what}: {message}"))
        }
        other => other,
    })
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
        subscribe(
            &mut watcher,
            directory,
            RecursiveMode::NonRecursive,
            "metadata",
        )?;
    }
    for directory in &metadata {
        let refs = directory.join("refs");
        if refs.is_dir() {
            subscribe(&mut watcher, &refs, RecursiveMode::Recursive, "refs")?;
        }
    }
    let worker = thread::spawn(move || {
        while let Ok(message) = message_rx.recv() {
            let mut pending = match message {
                Message::Changed(scope) => Some(scope),
                Message::Stop => return,
                Message::Degraded(error) => {
                    on_event(WatchEvent::Degraded(error));
                    None
                }
            };
            let first_change = Instant::now();
            let mut last_change = first_change;
            if pending.is_none() {
                continue;
            }

            loop {
                let now = Instant::now();
                if debounce_expired(first_change, last_change, now) {
                    break;
                }
                match message_rx.recv_timeout(debounce_wait(first_change, last_change, now)) {
                    Ok(Message::Changed(scope)) => {
                        pending = Some(match pending {
                            Some(pending_scope) => merge_scope(pending_scope, scope),
                            None => scope,
                        });
                        last_change = Instant::now();
                    }
                    Ok(Message::Degraded(error)) => {
                        on_event(WatchEvent::Degraded(error));
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        let now = Instant::now();
                        if debounce_expired(first_change, last_change, now) {
                            break;
                        }
                    }
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

#[cfg(test)]
mod tests {
    use std::{
        path::PathBuf,
        time::{Duration, Instant},
    };

    use notify::{
        event::{DataChange, ModifyKind},
        Event, EventKind,
    };

    use super::{
        classify, debounce_expired, debounce_wait, merge_scope, ChangeScope, MAX_DEBOUNCE, SETTLE,
    };

    #[test]
    fn classifies_only_components_relative_to_the_metadata_directory() {
        let metadata = PathBuf::from("/tmp/refs/repository/.git");
        let event = |path: &str| {
            Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
                .add_path(metadata.join(path))
        };

        assert_eq!(
            classify(&event("config"), std::slice::from_ref(&metadata)),
            None
        );
        assert_eq!(
            classify(&event("refs/heads/main"), std::slice::from_ref(&metadata)),
            Some(ChangeScope::Metadata)
        );
        assert_eq!(
            classify(&event("index.lock"), std::slice::from_ref(&metadata)),
            Some(ChangeScope::Worktree)
        );
    }

    #[test]
    fn debounce_settles_quiet_events_and_has_a_hard_maximum() {
        let first = Instant::now();
        let recent = first + MAX_DEBOUNCE.saturating_sub(Duration::from_millis(1));

        assert!(!debounce_expired(first, recent, recent));
        assert_eq!(
            debounce_wait(first, recent, recent),
            Duration::from_millis(1)
        );
        assert!(debounce_expired(first, recent, first + MAX_DEBOUNCE));
        assert!(debounce_expired(first, first, first + SETTLE));
    }

    #[test]
    fn metadata_changes_take_precedence_when_debounced_together() {
        assert_eq!(
            merge_scope(ChangeScope::Worktree, ChangeScope::Metadata),
            ChangeScope::Metadata
        );
        assert_eq!(
            merge_scope(ChangeScope::Worktree, ChangeScope::Worktree),
            ChangeScope::Worktree
        );
    }
}
