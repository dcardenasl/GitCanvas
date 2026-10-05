//! Local worktree read and safety integration tests.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]

mod support;

use std::{fs, path::Path};

use git2::build::CheckoutBuilder;
use gitcanvas_core::{
    error::AppError,
    repository::ActiveRepo,
    worktree::{
        get_worktree_file_content, get_worktree_file_diff, get_worktree_fingerprint,
        get_worktree_snapshot, WorktreeFileContentRequest, WorktreeFileDiffRequest, WorktreeSide,
        WorktreeSnapshotRequest,
    },
};
use support::Fixture;

fn clean_checkout(fixture: &Fixture, commit: git2::Oid) {
    fixture.repo.set_head("refs/heads/main").unwrap();
    fixture
        .repo
        .checkout_tree(
            fixture.repo.find_commit(commit).unwrap().as_object(),
            Some(CheckoutBuilder::new().force()),
        )
        .unwrap();
}

fn active(fixture: &Fixture) -> ActiveRepo {
    ActiveRepo::validate(fixture.dir.path()).unwrap()
}

#[test]
fn separates_staged_unstaged_and_new_files() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("a.txt", b"one\n")],
    );
    clean_checkout(&fixture, commit);

    fs::write(fixture.dir.path().join("a.txt"), "one\nstaged\n").unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.add_path(Path::new("a.txt")).unwrap();
    index.write().unwrap();
    fs::write(fixture.dir.path().join("a.txt"), "one\nstaged\nunstaged\n").unwrap();
    fs::write(fixture.dir.path().join("new.txt"), "new\n").unwrap();

    let snapshot = get_worktree_snapshot(
        &active(&fixture),
        &WorktreeSnapshotRequest {
            staged_cursor: None,
            unstaged_cursor: None,
            limit: None,
            expected_revision: None,
        },
    )
    .unwrap();

    assert_eq!(snapshot.staged.files.len(), 1);
    assert_eq!(snapshot.staged.files[0].path, "a.txt");
    assert_eq!(snapshot.staged.insertions, 1);
    assert_eq!(snapshot.unstaged.files.len(), 2);
    assert!(snapshot
        .unstaged
        .files
        .iter()
        .any(|file| file.path == "a.txt"));
    assert!(snapshot
        .unstaged
        .files
        .iter()
        .any(|file| file.path == "new.txt"));
    assert_eq!(snapshot.unstaged.insertions, 2);
}

#[test]
fn includes_new_files_but_respects_gitignore_for_reads_and_listing() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[
            (".gitignore", b"ignored.txt\n"),
            ("tracked.txt", b"tracked\n"),
        ],
    );
    clean_checkout(&fixture, commit);
    fs::write(fixture.dir.path().join("untracked.txt"), "external\n").unwrap();
    fs::write(fixture.dir.path().join("ignored.txt"), "generated\n").unwrap();

    let repository = active(&fixture);
    let snapshot = get_worktree_snapshot(
        &repository,
        &WorktreeSnapshotRequest {
            staged_cursor: None,
            unstaged_cursor: None,
            limit: None,
            expected_revision: None,
        },
    )
    .unwrap();
    assert!(snapshot
        .unstaged
        .files
        .iter()
        .any(|file| file.path == "untracked.txt"));
    assert!(!snapshot
        .unstaged
        .files
        .iter()
        .any(|file| file.path == "ignored.txt"));

    let untracked = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "untracked.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(untracked.text.as_deref(), Some("external\n"));

    let error = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "ignored.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap_err();
    assert!(matches!(error, AppError::WorktreeFileUnavailable(_)));
}

#[test]
fn reads_the_index_or_disk_version_of_a_local_file() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("a.txt", b"one\n")],
    );
    clean_checkout(&fixture, commit);

    fs::write(fixture.dir.path().join("a.txt"), "one\nstaged\n").unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.add_path(Path::new("a.txt")).unwrap();
    index.write().unwrap();
    fs::write(fixture.dir.path().join("a.txt"), "one\nstaged\ndisk\n").unwrap();

    let repository = active(&fixture);
    let staged = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Staged,
            path: "a.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap();
    let unstaged = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "a.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap();

    assert_eq!(staged.text.as_deref(), Some("one\nstaged\n"));
    assert_eq!(unstaged.text.as_deref(), Some("one\nstaged\ndisk\n"));
}

#[test]
fn staged_blob_limits_are_checked_before_reading_the_content() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("a.txt", b"base\n")],
    );
    clean_checkout(&fixture, commit);
    let contents = vec![b'x'; 32 * 1024 * 1024 + 1];
    fs::write(fixture.dir.path().join("huge.txt"), &contents).unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.add_path(Path::new("huge.txt")).unwrap();
    index.write().unwrap();

    let repository = active(&fixture);
    let withheld = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Staged,
            path: "huge.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(withheld.bytes, contents.len().to_string());
    assert_eq!(
        withheld.omitted,
        Some(gitcanvas_core::diff::DiffOmission::TooLarge)
    );
    assert!(withheld.text.is_none());

    let error = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Staged,
            path: "huge.txt".into(),
            expected_revision: None,
            expand: true,
        },
    )
    .unwrap_err();
    assert!(matches!(error, AppError::ResourceLimitExceeded(_)));
    assert!(error.to_string().contains("huge.txt"));
    assert!(error.to_string().contains("33554432"));
}

#[test]
fn loads_one_file_diff_only_when_requested_and_pages_summaries() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("a.txt", b"one\n"), ("b.txt", b"two\n")],
    );
    clean_checkout(&fixture, commit);
    fs::write(fixture.dir.path().join("a.txt"), "changed\n").unwrap();
    fs::write(fixture.dir.path().join("b.txt"), "changed\n").unwrap();

    let repository = active(&fixture);
    let page = get_worktree_snapshot(
        &repository,
        &WorktreeSnapshotRequest {
            staged_cursor: None,
            unstaged_cursor: None,
            limit: Some(1),
            expected_revision: None,
        },
    )
    .unwrap();
    assert_eq!(page.unstaged.files.len(), 1);
    assert_eq!(page.unstaged.total_files, 2);
    let cursor = page.unstaged.next_cursor.clone().unwrap();
    assert!(cursor.starts_with(&page.revision));

    // Following the cursor reaches the second file, exactly once.
    let next = get_worktree_snapshot(
        &repository,
        &WorktreeSnapshotRequest {
            staged_cursor: None,
            unstaged_cursor: Some(cursor.clone()),
            limit: Some(1),
            expected_revision: Some(page.revision.clone()),
        },
    )
    .unwrap();
    assert_eq!(next.unstaged.files.len(), 1);
    assert_ne!(next.unstaged.files[0].path, page.unstaged.files[0].path);
    assert!(next.unstaged.next_cursor.is_none());

    let detail = get_worktree_file_diff(
        &repository,
        &WorktreeFileDiffRequest {
            side: WorktreeSide::Unstaged,
            path: "a.txt".into(),
            expected_revision: Some(page.revision),
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(detail.file.path, "a.txt");
    assert!(detail.file.patch.is_some());

    // Once the changes move on, the same cursor no longer names the same file.
    fs::write(fixture.dir.path().join("a.txt"), "changed again\n").unwrap();
    let stale = get_worktree_snapshot(
        &repository,
        &WorktreeSnapshotRequest {
            staged_cursor: None,
            unstaged_cursor: Some(cursor),
            limit: Some(1),
            expected_revision: None,
        },
    )
    .unwrap_err();
    assert!(matches!(stale, AppError::StaleCursor(_)), "{stale:?}");
}

#[test]
fn rejects_invalid_worktree_page_sizes_instead_of_clamping() {
    let fixture = Fixture::new();
    let repository = active(&fixture);
    for limit in [0, 251] {
        let error = get_worktree_snapshot(
            &repository,
            &WorktreeSnapshotRequest {
                staged_cursor: None,
                unstaged_cursor: None,
                limit: Some(limit),
                expected_revision: None,
            },
        )
        .unwrap_err();
        assert!(matches!(error, AppError::InvalidInput(_)), "{error:?}");
    }
}

#[test]
fn fingerprint_changes_when_worktree_metadata_changes() {
    let fixture = Fixture::new();
    let repository = active(&fixture);
    let path = fixture.dir.path().join("fingerprint.txt");

    fs::write(&path, "one").unwrap();
    let first = get_worktree_fingerprint(&repository).unwrap();
    assert_eq!(
        first.revision,
        get_worktree_fingerprint(&repository).unwrap().revision
    );
    fs::write(&path, "a longer value").unwrap();
    let second = get_worktree_fingerprint(&repository).unwrap();

    assert_ne!(first.revision, second.revision);
}

#[test]
fn rejects_traversal_absolute_paths_and_external_symlinks() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("a.txt", b"one\n")],
    );
    clean_checkout(&fixture, commit);
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.txt"), "secret\n").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(
        outside.path().join("secret.txt"),
        fixture.dir.path().join("outside.txt"),
    )
    .unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink("a.txt", fixture.dir.path().join("internal-link.txt")).unwrap();

    let repository = active(&fixture);
    for path in [
        "../secret.txt",
        "/tmp/secret.txt",
        "../repo2/a.txt",
        ".git/config",
    ] {
        let error = get_worktree_file_content(
            &repository,
            &WorktreeFileContentRequest {
                side: WorktreeSide::Unstaged,
                path: path.into(),
                expected_revision: None,
                expand: false,
            },
        )
        .unwrap_err();
        assert!(matches!(error, AppError::PathOutsideRepository(_)));
    }

    #[cfg(unix)]
    let error = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "outside.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap_err();
    #[cfg(unix)]
    assert!(matches!(error, AppError::PathOutsideRepository(_)));

    #[cfg(unix)]
    let error = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "internal-link.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap_err();
    #[cfg(unix)]
    assert!(matches!(error, AppError::WorktreeFileUnavailable(_)));
}

#[test]
fn reports_binary_invalid_utf8_and_resource_limits_consistently() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("binary.bin", b"\0binary"), ("invalid.txt", &[0xff, b'\n'])],
    );
    clean_checkout(&fixture, commit);
    fs::write(fixture.dir.path().join("binary.bin"), b"\0binary").unwrap();
    fs::write(fixture.dir.path().join("invalid.txt"), [0xff, b'\n']).unwrap();
    let mut late_nul = vec![b'x'; 8_001];
    late_nul.push(0);
    fs::write(fixture.dir.path().join("late-nul.txt"), late_nul).unwrap();

    let repository = active(&fixture);
    let binary = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "binary.bin".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(
        binary.omitted,
        Some(gitcanvas_core::diff::DiffOmission::Binary)
    );

    let invalid = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "invalid.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(invalid.text.as_deref(), Some("�\n"));

    let late_nul = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "late-nul.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap();
    assert!(late_nul.text.is_some());

    let huge = vec![b'x'; 2 * 1024 * 1024 + 1];
    fs::write(fixture.dir.path().join("huge.txt"), huge).unwrap();
    let response = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "huge.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap();
    assert_eq!(
        response.omitted,
        Some(gitcanvas_core::diff::DiffOmission::TooLarge)
    );
    assert!(response.text.is_none());

    let expanded = get_worktree_file_content(
        &repository,
        &WorktreeFileContentRequest {
            side: WorktreeSide::Unstaged,
            path: "huge.txt".into(),
            expected_revision: None,
            expand: true,
        },
    )
    .unwrap();
    assert!(expanded.text.is_some());

    let fingerprint = get_worktree_fingerprint(&repository).unwrap();
    assert!(!fingerprint.revision.is_empty());
}

#[test]
fn rejects_unresolved_index_conflicts() {
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("a.txt", b"base\n")],
    );
    clean_checkout(&fixture, commit);
    let ancestor = fixture.repo.blob(b"base\n").unwrap();
    let ours = fixture.repo.blob(b"ours\n").unwrap();
    let theirs = fixture.repo.blob(b"theirs\n").unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.clear().unwrap();
    for (stage, id) in [(1, ancestor), (2, ours), (3, theirs)] {
        index
            .add(&git2::IndexEntry {
                ctime: git2::IndexTime::new(0, 0),
                mtime: git2::IndexTime::new(0, 0),
                dev: 0,
                ino: 0,
                mode: 0o100_644,
                uid: 0,
                gid: 0,
                file_size: 0,
                id,
                flags: stage << 12,
                flags_extended: 0,
                path: b"a.txt".to_vec(),
            })
            .unwrap();
    }
    index.write().unwrap();

    let error = get_worktree_file_content(
        &active(&fixture),
        &WorktreeFileContentRequest {
            side: WorktreeSide::Staged,
            path: "a.txt".into(),
            expected_revision: None,
            expand: false,
        },
    )
    .unwrap_err();
    assert!(matches!(error, AppError::WorktreeFileUnavailable(_)));
}

#[test]
fn a_staged_file_that_is_then_removed_reads_as_unavailable_not_stale() {
    // The order an editor and `git` produce: stage a new file, change and
    // re-stage it, then delete it and stage the deletion.
    let fixture = Fixture::new();
    let commit = fixture.commit_files(
        "refs/heads/main",
        "initial",
        &[],
        1_000,
        &[("a.txt", b"one\n")],
    );
    clean_checkout(&fixture, commit);
    let file = fixture.dir.path().join("staged.txt");
    fs::write(&file, "before\n").unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.add_path(Path::new("staged.txt")).unwrap();
    index.write().unwrap();
    fs::write(&file, "after\n").unwrap();
    index.add_path(Path::new("staged.txt")).unwrap();
    index.write().unwrap();

    let repository = active(&fixture);
    let request = |expected: &str| WorktreeFileDiffRequest {
        side: WorktreeSide::Staged,
        path: "staged.txt".into(),
        expected_revision: Some(expected.to_owned()),
        expand: false,
    };
    let snapshot = |repository: &ActiveRepo| {
        get_worktree_snapshot(
            repository,
            &WorktreeSnapshotRequest {
                staged_cursor: None,
                unstaged_cursor: None,
                limit: None,
                expected_revision: None,
            },
        )
        .unwrap()
    };
    let before = snapshot(&repository);
    assert!(get_worktree_file_diff(&repository, &request(&before.revision)).is_ok());

    fs::remove_file(&file).unwrap();
    let mut index = fixture.repo.index().unwrap();
    index.remove_path(Path::new("staged.txt")).unwrap();
    index.write().unwrap();

    // The old revision is refused as stale...
    let stale = get_worktree_file_diff(&repository, &request(&before.revision)).unwrap_err();
    assert!(matches!(stale, AppError::WorktreeChanged(_)), "{stale:?}");
    // ...and under the new one the file is simply gone. This is what lets the
    // interface close the view instead of retrying forever.
    let after = snapshot(&repository);
    assert_ne!(after.revision, before.revision);
    let gone = get_worktree_file_diff(&repository, &request(&after.revision)).unwrap_err();
    assert!(
        matches!(gone, AppError::WorktreeFileUnavailable(_)),
        "{gone:?}"
    );
    // And the revision is stable while nothing changes.
    assert_eq!(snapshot(&repository).revision, after.revision);
}
