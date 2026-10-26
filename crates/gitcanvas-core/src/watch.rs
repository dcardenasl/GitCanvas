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
const INTERESTING_METADATA: [&str; 7] = [
    "HEAD",
    "refs",
    "packed-refs",
    "ORIG_HEAD",
    "MERGE_HEAD",
    "config",
    "config.worktree",
];
const WORKTREE_ADMIN_FILES: [&str; 4] = ["HEAD", "locked", "gitdir", "commondir"];

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
    /// A linked-worktree registration or its shared administrative metadata changed.
    Worktrees,
}

enum Message {
    Changed(ChangeScope),
    Degraded(String),
    Stop,
}

fn merge_scope(pending: ChangeScope, next: ChangeScope) -> ChangeScope {
    if pending == ChangeScope::Worktrees || next == ChangeScope::Worktrees {
        return ChangeScope::Worktrees;
    }
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

struct WatchPaths {
    metadata: Vec<PathBuf>,
    registry: PathBuf,
}

fn watch_paths(active: &ActiveRepo) -> Result<WatchPaths, AppError> {
    let repo = active.open()?;
    let common = repo.commondir().canonicalize()?;
    let registry = common.join("worktrees");
    Ok(WatchPaths {
        metadata: BTreeSet::from([repo.path().to_path_buf(), common])
            .into_iter()
            .collect(),
        registry,
    })
}

fn is_mutating(kind: EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

fn registry_event(path: &Path, registry: &Path) -> bool {
    // Some native backends report creation of the first registry directory on
    // the common Git directory itself instead of the new child path.
    if path == registry || registry.parent().is_some_and(|parent| path == parent) {
        return true;
    }
    let Ok(relative) = path.strip_prefix(registry) else {
        return false;
    };
    let components = relative.components().collect::<Vec<_>>();
    match components.as_slice() {
        [std::path::Component::Normal(_)] => true,
        [std::path::Component::Normal(_), std::path::Component::Normal(file)] => {
            WORKTREE_ADMIN_FILES.iter().any(|name| file == name)
        }
        _ => false,
    }
}

fn admin_event(path: &Path, registry: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(registry) else {
        return false;
    };
    matches!(
        relative.components().collect::<Vec<_>>().as_slice(),
        [std::path::Component::Normal(_), std::path::Component::Normal(file)]
            if WORKTREE_ADMIN_FILES.iter().any(|name| file == name)
    )
}

fn classify(event: &Event, paths: &WatchPaths) -> Option<ChangeScope> {
    if !is_mutating(event.kind) {
        return None;
    }
    if event
        .paths
        .iter()
        .any(|path| registry_event(path, &paths.registry) || admin_event(path, &paths.registry))
    {
        return Some(ChangeScope::Worktrees);
    }
    if event.paths.iter().any(|path| {
        paths
            .metadata
            .iter()
            .filter_map(|root| path.strip_prefix(root).ok())
            .any(|relative| {
                if path.starts_with(&paths.registry) {
                    return false;
                }
                relative
                    .file_name()
                    .is_some_and(|name| name == "index" || name == "index.lock")
            })
    }) {
        return Some(ChangeScope::Worktree);
    }
    if event.paths.iter().any(|path| {
        paths
            .metadata
            .iter()
            .filter_map(|root| path.strip_prefix(root).ok())
            .any(|relative| {
                if path.starts_with(&paths.registry) {
                    return false;
                }
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
    let paths = watch_paths(active)?;
    let (message_tx, message_rx) = mpsc::channel::<Message>();
    let callback_tx = message_tx.clone();
    let callback_paths = WatchPaths {
        metadata: paths.metadata.clone(),
        registry: paths.registry.clone(),
    };

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| match result {
            Ok(event) => {
                if let Some(scope) = classify(&event, &callback_paths) {
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

    for directory in &paths.metadata {
        subscribe(
            &mut watcher,
            directory,
            RecursiveMode::NonRecursive,
            "metadata",
        )?;
    }
    for directory in &paths.metadata {
        let refs = directory.join("refs");
        if refs.is_dir() {
            subscribe(&mut watcher, &refs, RecursiveMode::Recursive, "refs")?;
        }
    }
    if paths.registry.is_dir() {
        subscribe(
            &mut watcher,
            &paths.registry,
            RecursiveMode::Recursive,
            "worktree registry",
        )?;
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
        classify, debounce_expired, debounce_wait, merge_scope, ChangeScope, WatchPaths,
        MAX_DEBOUNCE, SETTLE,
    };

    #[test]
    fn classifies_only_components_relative_to_the_metadata_directory() {
        let metadata = PathBuf::from("/tmp/refs/repository/.git");
        let registry = metadata.join("worktrees");
        let paths = WatchPaths {
            metadata: vec![PathBuf::from("/tmp/refs/repository"), metadata.clone()],
            registry: registry.clone(),
        };
        let event = |path: &str| {
            Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
                .add_path(metadata.join(path))
        };

        assert_eq!(
            classify(&event("config"), &paths),
            Some(ChangeScope::Metadata)
        );
        assert_eq!(
            classify(&event("refs/heads/main"), &paths),
            Some(ChangeScope::Metadata)
        );
        assert_eq!(
            classify(&event("index.lock"), &paths),
            Some(ChangeScope::Worktree)
        );
        assert_eq!(
            classify(&event("worktrees/topic/HEAD"), &paths),
            Some(ChangeScope::Worktrees)
        );
        assert_eq!(
            classify(&event("worktrees/new-topic"), &paths),
            Some(ChangeScope::Worktrees)
        );
        assert_eq!(classify(&event("worktrees/topic/index"), &paths), None);
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
        assert_eq!(
            merge_scope(ChangeScope::Metadata, ChangeScope::Worktrees),
            ChangeScope::Worktrees
        );
    }
}
