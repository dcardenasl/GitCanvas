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
    /// Shared stash reference or reflog changed; graph data need not be invalidated.
    Stashes,
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

#[derive(Default)]
struct PendingChanges {
    ordinary: Option<ChangeScope>,
    stashes: bool,
}

impl PendingChanges {
    fn push(&mut self, scope: ChangeScope) {
        if scope == ChangeScope::Stashes {
            self.stashes = true;
        } else {
            self.ordinary = Some(
                self.ordinary
                    .map_or(scope, |pending| merge_scope(pending, scope)),
            );
        }
    }

    fn scopes(self) -> impl Iterator<Item = ChangeScope> {
        [self.ordinary, self.stashes.then_some(ChangeScope::Stashes)]
            .into_iter()
            .flatten()
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
    common: PathBuf,
    metadata: Vec<PathBuf>,
    registry: PathBuf,
}

fn watch_paths(active: &ActiveRepo) -> Result<WatchPaths, AppError> {
    let repo = active.open()?;
    let common = repo.commondir().canonicalize()?;
    let registry = common.join("worktrees");
    Ok(WatchPaths {
        common: common.clone(),
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

fn stash_path(path: &Path, paths: &WatchPaths, kind: EventKind) -> bool {
    let Ok(relative) = path.strip_prefix(&paths.common) else {
        return false;
    };
    if [
        "refs/stash",
        "refs/stash.lock",
        "logs/refs/stash",
        "logs/refs/stash.lock",
    ]
    .iter()
    .any(|candidate| relative == Path::new(candidate))
    {
        return true;
    }
    // kqueue can report an atomic reflog replacement on the containing
    // directory. Reflog-container edits are not graph-root changes. A bare
    // modification of that directory is not enough: Windows reports one for the
    // parent of every branch reflog, so each commit would also look like a stash.
    if relative == Path::new("logs/refs") {
        return !matches!(
            kind,
            EventKind::Modify(
                notify::event::ModifyKind::Any | notify::event::ModifyKind::Metadata(_)
            )
        );
    }
    // Parent directories matter when first created, removed or replaced. Their
    // ordinary mtime changes alone must not turn every commit into a stash event.
    matches!(
        kind,
        EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(notify::event::ModifyKind::Name(_))
    ) && ["logs", "logs/refs"]
        .iter()
        .any(|candidate| relative == Path::new(candidate))
}

fn classify_scopes(event: &Event, paths: &WatchPaths) -> Vec<ChangeScope> {
    if !is_mutating(event.kind) {
        return Vec::new();
    }
    let mut ordinary = event.clone();
    ordinary
        .paths
        .retain(|path| !stash_path(path, paths, event.kind));
    let mut scopes = Vec::with_capacity(2);
    if ordinary.paths.len() != event.paths.len() {
        scopes.push(ChangeScope::Stashes);
    }
    if let Some(scope) = classify(&ordinary, paths) {
        scopes.push(scope);
    }
    scopes
}

fn classify(event: &Event, paths: &WatchPaths) -> Option<ChangeScope> {
    if !is_mutating(event.kind) {
        return None;
    }
    if event
        .paths
        .iter()
        .any(|path| stash_path(path, paths, event.kind))
    {
        return Some(ChangeScope::Stashes);
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
                if path.starts_with(&paths.registry) || relative.starts_with("logs") {
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
                if path.starts_with(&paths.registry) || relative.starts_with("logs") {
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

fn subscribe_paths(watcher: &mut RecommendedWatcher, paths: &WatchPaths) -> Result<(), AppError> {
    for directory in &paths.metadata {
        subscribe(watcher, directory, RecursiveMode::NonRecursive, "metadata")?;
    }
    for directory in &paths.metadata {
        let refs = directory.join("refs");
        if refs.is_dir() {
            subscribe(watcher, &refs, RecursiveMode::Recursive, "refs")?;
        }
    }
    if paths.registry.is_dir() {
        subscribe(
            watcher,
            &paths.registry,
            RecursiveMode::Recursive,
            "worktree registry",
        )?;
    }
    for directory in [paths.common.join("logs"), paths.common.join("logs/refs")] {
        if directory.is_dir() {
            subscribe(
                watcher,
                &directory,
                RecursiveMode::NonRecursive,
                "stash reflog parent",
            )?;
        }
    }
    let stash_log = paths.common.join("logs/refs/stash");
    if std::fs::symlink_metadata(&stash_log).is_ok_and(|metadata| metadata.file_type().is_file()) {
        // kqueue observes edits through a file subscription; its parents detect
        // replacement/creation and let the active generation reinstall this watch.
        subscribe(
            watcher,
            &stash_log,
            RecursiveMode::NonRecursive,
            "stash reflog",
        )?;
    }
    Ok(())
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
        common: paths.common.clone(),
        metadata: paths.metadata.clone(),
        registry: paths.registry.clone(),
    };

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| match result {
            Ok(event) => {
                for scope in classify_scopes(&event, &callback_paths) {
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

    subscribe_paths(&mut watcher, &paths)?;
    let worker = thread::spawn(move || {
        while let Ok(message) = message_rx.recv() {
            let mut pending = PendingChanges::default();
            match message {
                Message::Changed(scope) => pending.push(scope),
                Message::Stop => return,
                Message::Degraded(error) => {
                    on_event(WatchEvent::Degraded(error));
                    continue;
                }
            }
            let first_change = Instant::now();
            let mut last_change = first_change;

            loop {
                let now = Instant::now();
                if debounce_expired(first_change, last_change, now) {
                    break;
                }
                match message_rx.recv_timeout(debounce_wait(first_change, last_change, now)) {
                    Ok(Message::Changed(scope)) => {
                        pending.push(scope);
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

            for scope in pending.scopes() {
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
            common: metadata.clone(),
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

    #[test]
    fn stash_ref_reflog_and_mixed_events_keep_independent_scopes() {
        let common = PathBuf::from("/repo/.git");
        let paths = WatchPaths {
            common: common.clone(),
            metadata: vec![common.clone()],
            registry: common.join("worktrees"),
        };
        for path in ["refs/stash", "logs/refs/stash", "logs/refs/stash.lock"] {
            let event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
                .add_path(common.join(path));
            assert_eq!(
                super::classify_scopes(&event, &paths),
                vec![ChangeScope::Stashes]
            );
        }
        let event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Content)))
            .add_path(common.join("logs/refs/stash"))
            .add_path(common.join("index"));
        let scopes = super::classify_scopes(&event, &paths);
        assert!(scopes.contains(&ChangeScope::Stashes));
        assert!(scopes.contains(&ChangeScope::Worktree));
        for order in [
            [ChangeScope::Stashes, ChangeScope::Metadata],
            [ChangeScope::Metadata, ChangeScope::Stashes],
        ] {
            let mut pending = super::PendingChanges::default();
            for scope in order {
                pending.push(scope);
            }
            let scopes = pending.scopes().collect::<Vec<_>>();
            assert!(scopes.contains(&ChangeScope::Stashes));
            assert!(scopes.contains(&ChangeScope::Metadata));
            assert_eq!(scopes.len(), 2);
        }
    }

    #[test]
    fn a_bare_modification_of_the_reflog_parent_is_not_a_stash_event() {
        let common = PathBuf::from("/tmp/refs/repository/.git");
        let paths = WatchPaths {
            common: common.clone(),
            metadata: vec![common.clone()],
            registry: common.join("worktrees"),
        };
        for kind in [
            EventKind::Modify(ModifyKind::Any),
            EventKind::Modify(ModifyKind::Metadata(notify::event::MetadataKind::Any)),
        ] {
            let event = Event::new(kind).add_path(common.join("logs/refs"));
            assert!(!super::classify_scopes(&event, &paths).contains(&ChangeScope::Stashes));
        }
        let event = Event::new(EventKind::Modify(ModifyKind::Data(DataChange::Any)))
            .add_path(common.join("logs/refs"));
        assert!(super::classify_scopes(&event, &paths).contains(&ChangeScope::Stashes));
    }
}
