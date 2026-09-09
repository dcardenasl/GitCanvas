//! Noticing that a repository changed underneath the window.
//!
//! History is only immutable for a given walk. Refs move, commits arrive, and
//! a client that reads once and caches forever shows a repository as it was
//! when it was opened. Watching the metadata directory is what turns that into
//! a view of what is actually there.

use std::{
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::Duration,
};

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};

use crate::{error::AppError, repository::ActiveRepo};

/// How long to wait for a burst of filesystem events to settle.
///
/// A single commit rewrites the index, a ref, the reflog and often
/// `packed-refs`, arriving as a dozen events over a few milliseconds. Reacting
/// to each one would re-read the history a dozen times for one commit.
const SETTLE: Duration = Duration::from_millis(250);

/// Metadata whose change means the history or the refs moved.
///
/// Everything else under the metadata directory — object files, lock files,
/// caches — either accompanies one of these or is noise.
const INTERESTING: [&str; 5] = ["HEAD", "refs", "packed-refs", "ORIG_HEAD", "MERGE_HEAD"];

/// A live watch over one repository. Dropping it stops the watch.
///
/// The handle owns both the watcher and the thread that debounces its events;
/// letting either outlive the other is how a watch keeps firing for a
/// repository nobody is looking at any more.
pub struct RepositoryWatcher {
    _watcher: RecommendedWatcher,
    stop: mpsc::Sender<()>,
}

impl Drop for RepositoryWatcher {
    fn drop(&mut self) {
        // Best effort: the thread may already have exited with the channel.
        let _ = self.stop.send(());
    }
}

fn is_interesting(event: &Event) -> bool {
    event.paths.iter().any(|path| {
        path.components().any(|component| {
            INTERESTING
                .iter()
                .any(|name| component.as_os_str() == *name)
        })
    })
}

/// The directory holding a repository's metadata.
///
/// Usually `<worktree>/.git`, but a linked worktree has a `.git` *file*
/// pointing elsewhere, so the repository's own answer is used rather than an
/// assumption about the layout.
fn metadata_dir(active: &ActiveRepo) -> Result<PathBuf, AppError> {
    Ok(active.open()?.path().to_path_buf())
}

/// Watches a repository and calls `on_change` when its refs or HEAD move.
///
/// Only the metadata directory is watched, never the working tree: a watch
/// over the whole checkout fires on every file save, and on a large repository
/// costs thousands of handles for information this application does not use.
///
/// # Errors
///
/// Returns [`AppError`] when the repository cannot be opened or the platform
/// refuses to establish the watch.
pub fn watch_repository(
    active: &ActiveRepo,
    on_change: impl Fn() + Send + 'static,
) -> Result<RepositoryWatcher, AppError> {
    let directory = metadata_dir(active)?;
    let (events_tx, events_rx) = mpsc::channel::<Event>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let mut watcher = notify::recommended_watcher(move |result: notify::Result<Event>| {
        if let Ok(event) = result {
            if is_interesting(&event) {
                // A closed receiver means the handle was dropped; the watcher
                // is about to go with it, so the failure is not worth logging.
                let _ = events_tx.send(event);
            }
        }
    })
    .map_err(|error| AppError::Internal(format!("could not create a watcher: {error}")))?;

    watcher
        .watch(&directory, RecursiveMode::Recursive)
        .map_err(|error| {
            AppError::Internal(format!("could not watch {}: {error}", directory.display()))
        })?;

    thread::spawn(move || {
        loop {
            // Block until something happens, then swallow the rest of the
            // burst before reporting once.
            match events_rx.recv() {
                Ok(_) => {}
                Err(_) => return,
            }
            while events_rx.recv_timeout(SETTLE).is_ok() {}

            if stop_rx.try_recv().is_ok() {
                return;
            }
            on_change();
        }
    });

    Ok(RepositoryWatcher {
        _watcher: watcher,
        stop: stop_tx,
    })
}

/// Whether a path looks like a repository this module can watch.
///
/// Exposed for tests; the watch itself validates through [`ActiveRepo`].
#[must_use]
pub fn is_metadata_path(path: &Path) -> bool {
    path.file_name().is_some_and(|name| name == ".git")
}
