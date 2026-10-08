#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
//! The repository watcher, exercised against real filesystem activity.

mod support;

use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc::{self, Receiver},
        Arc,
    },
    time::{Duration, Instant},
};

use gitcanvas_core::{
    error::AppError,
    repository::ActiveRepo,
    watch::{watch_repository, ChangeScope, WatchEvent},
};
use support::Fixture;

/// Long enough for a debounced watcher to report, short enough to fail fast.
const WAIT: Duration = Duration::from_secs(10);
const QUIET: Duration = Duration::from_millis(500);

fn wait_until_quiet<T>(receiver: &Receiver<T>) {
    let deadline = Instant::now()
        .checked_add(WAIT)
        .expect("deadline is representable");
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        assert!(
            !remaining.is_zero(),
            "watcher did not settle before timeout"
        );
        match receiver.recv_timeout(remaining.min(QUIET)) {
            Ok(_) => {}
            Err(mpsc::RecvTimeoutError::Timeout) if remaining >= QUIET => return,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                panic!("watcher did not settle before timeout")
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                panic!("watcher event channel disconnected before settling")
            }
        }
    }
}

fn wait_until_disconnected<T>(receiver: &Receiver<T>) {
    let deadline = Instant::now()
        .checked_add(WAIT)
        .expect("deadline is representable");
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        assert!(
            !remaining.is_zero(),
            "watcher callback channel remained connected after drop"
        );
        match receiver.recv_timeout(remaining) {
            Ok(_) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                panic!("watcher callback channel remained connected after drop")
            }
        }
    }
}

#[test]
fn reports_a_commit_made_after_the_repository_was_opened() {
    let fixture = Fixture::new();
    let first = fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[("a.txt", b"a\n")]);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();

    let (tx, rx) = mpsc::channel();
    let _watcher = watch_repository(&active, move |event| {
        let _ = tx.send(event);
    })
    .unwrap();
    wait_until_quiet(&rx);

    // The exact situation this exists for: work arriving while the window is
    // already open.
    fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("a.txt", b"a\nb\n")],
    );

    assert!(matches!(
        rx.recv_timeout(WAIT)
            .expect("a new commit should have been reported"),
        WatchEvent::Changed(ChangeScope::Metadata)
    ));
}

#[test]
fn reports_a_branch_moving() {
    let fixture = Fixture::new();
    let base = fixture.commit_files("refs/heads/main", "base", &[], 1_000, &[("a.txt", b"a\n")]);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();

    let (tx, rx) = mpsc::channel();
    let _watcher = watch_repository(&active, move |event| {
        let _ = tx.send(event);
    })
    .unwrap();
    wait_until_quiet(&rx);

    fixture.commit_files("refs/heads/feature", "on a branch", &[base], 2_000, &[]);

    assert!(matches!(
        rx.recv_timeout(WAIT)
            .expect("a new branch should have been reported"),
        WatchEvent::Changed(ChangeScope::Metadata)
    ));
}

#[test]
fn coalesces_the_burst_a_single_commit_produces() {
    let fixture = Fixture::new();
    let first = fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[("a.txt", b"a\n")]);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();

    let calls = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&calls);
    let (tx, rx) = mpsc::channel();
    let _watcher = watch_repository(&active, move |_| {
        counter.fetch_add(1, Ordering::SeqCst);
        let _ = tx.send(());
    })
    .unwrap();
    wait_until_quiet(&rx);

    fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("a.txt", b"a\nb\n")],
    );
    rx.recv_timeout(WAIT).unwrap();

    // One commit writes a ref, the index and the reflog. Reporting each one
    // would re-read the whole history several times for a single change.
    assert!(matches!(
        rx.recv_timeout(QUIET),
        Err(mpsc::RecvTimeoutError::Timeout)
    ));
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "one commit must report once, not once per file it touched"
    );
}

#[test]
fn stops_reporting_once_the_handle_is_dropped() {
    let fixture = Fixture::new();
    let first = fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[("a.txt", b"a\n")]);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();

    let calls = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&calls);
    let (tx, rx) = mpsc::channel();
    let watcher = watch_repository(&active, move |_| {
        counter.fetch_add(1, Ordering::SeqCst);
        let _ = tx.send(());
    })
    .unwrap();
    wait_until_quiet(&rx);

    drop(watcher);
    wait_until_disconnected(&rx);
    calls.store(0, Ordering::SeqCst);

    fixture.commit_files(
        "refs/heads/main",
        "second",
        &[first],
        2_000,
        &[("a.txt", b"a\nb\n")],
    );
    // A watch that outlives the repository nobody is looking at any more keeps
    // invalidating caches for a window that has moved on.
    assert!(matches!(
        rx.recv_timeout(QUIET),
        Err(mpsc::RecvTimeoutError::Disconnected)
    ));
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[test]
fn reports_index_changes_as_worktree_changes() {
    let fixture = Fixture::new();
    fixture.commit_files("refs/heads/main", "first", &[], 1_000, &[("a.txt", b"a\n")]);
    let active = ActiveRepo::validate(fixture.dir.path()).unwrap();
    let (tx, rx) = mpsc::channel();
    let _watcher = watch_repository(&active, move |event| {
        let _ = tx.send(event);
    })
    .unwrap();
    wait_until_quiet(&rx);

    std::fs::write(fixture.dir.path().join("a.txt"), "changed\n").unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.add_path(std::path::Path::new("a.txt")).unwrap();
    index.write().unwrap();

    assert!(matches!(
        rx.recv_timeout(WAIT)
            .expect("a worktree change should be reported"),
        WatchEvent::Changed(ChangeScope::Worktree)
    ));
}

#[test]
fn watching_a_path_that_is_not_a_repository_is_an_error() {
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(
        ActiveRepo::validate(dir.path()),
        Err(AppError::InvalidRepository(_))
    ));
}
